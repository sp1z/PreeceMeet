using System.Windows;
using PreeceMeet.Models;
using PreeceMeet.Services;
using PreeceMeet.Views;
using Velopack;
using Velopack.Sources;

namespace PreeceMeet;

public partial class App : Application
{
    // ── Services (poor-man's DI; no container needed for this app size) ───────
    private readonly SettingsService  _settings   = new();
    private readonly SessionService   _session    = new();
    private readonly UrlSchemeService _urlScheme  = new();
    private LiveKitService?           _liveKit;
    private AuthService?              _auth;
    private RoomService?              _roomService;
    private MainWindow?               _mainWindow;

    // ── Entry point ───────────────────────────────────────────────────────────

    protected override async void OnStartup(StartupEventArgs e)
    {
        // Velopack must be the very first thing called.
        VelopackApp.Build().Run();

        base.OnStartup(e);

        // Catch any unhandled exceptions from async void and background threads.
        DispatcherUnhandledException += (_, ex) =>
        {
            MessageBox.Show($"Unexpected error: {ex.Exception.Message}\n\n{ex.Exception.StackTrace}",
                "PreeceMeet Error", MessageBoxButton.OK, MessageBoxImage.Error);
            ex.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, ex) =>
        {
            MessageBox.Show($"Fatal error: {ex.ExceptionObject}",
                "PreeceMeet Fatal Error", MessageBoxButton.OK, MessageBoxImage.Error);
        };

        _settings.Load();

        // Register custom URL scheme (idempotent).
        UrlSchemeService.RegisterUrlScheme();

        // Parse any command-line URL argument (preecemeet://RoomName).
        string? urlRoomName = null;
        if (e.Args.Length > 0)
            urlRoomName = UrlSchemeService.ParseRoomFromUrl(e.Args[0]);

        // Single-instance guard.
        if (!_urlScheme.TryAcquireSingleInstance())
        {
            // Another instance is already running.
            if (urlRoomName is not null)
                UrlSchemeService.ForwardToRunningInstance(urlRoomName);
            // Always exit the second instance.
            Current.Shutdown();
            return;
        }

        // Start the IPC server so we can receive URLs from future instances.
        _urlScheme.StartIpcServer();
        _urlScheme.RoomJoinRequested += OnRoomJoinRequested;

        // Initialise services.
        _auth        = new AuthService(_settings.Current.ServerUrl);
        _liveKit     = new LiveKitService();
        _roomService = new RoomService(_settings, _session);

        // Try to reuse saved session; fall back to login UI.
        var session = _session.Load();
        if (session is null)
        {
            if (!await RunLoginFlowAsync())
            {
                Current.Shutdown();
                return;
            }
        }

        // Seed sidebar channels from settings, then start background polling.
        _roomService.RebuildFromSettings();
        _roomService.Start();

        // Show main window.
        _mainWindow = new MainWindow(_liveKit, _settings, _session, _auth, _urlScheme, _roomService);
        MainWindow  = _mainWindow;
        _mainWindow.SignOutRequested += OnSignOutRequested;
        _mainWindow.Show();

        // Check for updates silently in the background.
        _ = CheckAndApplyUpdatesAsync();

        // If launched from a URL scheme, join that room; otherwise auto-join if configured.
        if (urlRoomName is not null)
            _mainWindow.JoinRoom(urlRoomName);
        else if (!string.IsNullOrEmpty(_settings.Current.AutoJoinChannel) &&
                 _settings.Current.Channels.Any(c =>
                     c.Name.Equals(_settings.Current.AutoJoinChannel, StringComparison.OrdinalIgnoreCase)))
            _mainWindow.JoinRoom(_settings.Current.AutoJoinChannel, muteCamera: true);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Disconnect and release all devices before the process exits.
        // LiveKit disconnect is fire-and-forget — we can't await in OnExit.
        try { _liveKit?.DisconnectAsync().GetAwaiter().GetResult(); } catch { }
        _urlScheme.Dispose();
        _roomService?.Dispose();
        _liveKit?.Dispose();
        base.OnExit(e);
    }

    // ── Login flow ────────────────────────────────────────────────────────────

    /// <summary>Shows Login -> TOTP windows and persists the resulting session.</summary>
    /// <returns>true if authentication succeeded; false if user cancelled.</returns>
    private async Task<bool> RunLoginFlowAsync()
    {
        var loginWindow = new LoginWindow(_auth!, _settings);
        if (loginWindow.ShowDialog() != true || loginWindow.AuthResult is null)
            return false;

        // Persist encrypted session.
        var result = loginWindow.AuthResult;
        _session.Save(new SavedSession
        {
            LiveKitUrl   = result.LiveKitUrl,
            LiveKitToken = result.LiveKitToken,
            SessionToken = result.SessionToken,
            Email        = _settings.Current.SavedEmail,
            SavedAt      = DateTimeOffset.UtcNow,
        });

        return true;
    }

    // ── Auto-update ───────────────────────────────────────────────────────────

    private async Task CheckAndApplyUpdatesAsync()
    {
        try
        {
            var mgr = new UpdateManager(new GithubSource("https://github.com/sp1z/PreeceMeet", null, false));
            if (!mgr.IsInstalled) return; // skip in dev/portable mode

            var updateInfo = await mgr.CheckForUpdatesAsync();
            if (updateInfo == null) return;

            _mainWindow?.ShowUpdateStatus("Update available, downloading...");
            _mainWindow?.ShowUpdateOverlay("Downloading update...", 0);
            await mgr.DownloadUpdatesAsync(updateInfo,
                p =>
                {
                    _mainWindow?.ShowUpdateStatus($"Downloading update... {p}%");
                    _mainWindow?.ShowUpdateOverlay("Downloading update...", p);
                });

            _mainWindow?.ShowUpdateStatus("Restarting to apply update...");
            _mainWindow?.ShowUpdateRestarting();
            await Task.Delay(1500);
            mgr.ApplyUpdatesAndRestart(updateInfo.TargetFullRelease);
        }
        catch
        {
            _mainWindow?.HideUpdateOverlay();
        }
    }

    // ── Sign-out ──────────────────────────────────────────────────────────────

    private async void OnSignOutRequested()
    {
        // Disconnect from any active call first.
        if (_liveKit is not null)
            await _liveKit.DisconnectAsync();

        _mainWindow?.Hide();

        if (await RunLoginFlowAsync())
        {
            _mainWindow?.Show();
        }
        else
        {
            Current.Shutdown();
        }
    }

    // ── IPC / URL scheme ──────────────────────────────────────────────────────

    private void OnRoomJoinRequested(string roomName)
    {
        Dispatcher.Invoke(() =>
        {
            if (_mainWindow is null) return;
            _mainWindow.Activate();
            _mainWindow.JoinRoom(roomName);
        });
    }
}
