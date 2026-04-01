using System.Windows;
using PreeceMeet.Models;
using PreeceMeet.Services;
using PreeceMeet.Views;
using Velopack;

namespace PreeceMeet;

public partial class App : Application
{
    // ── Services (poor-man's DI; no container needed for this app size) ───────
    private readonly SettingsService  _settings   = new();
    private readonly SessionService   _session    = new();
    private readonly UrlSchemeService _urlScheme  = new();
    private LiveKitService?           _liveKit;
    private AuthService?              _auth;
    private MainWindow?               _mainWindow;

    // ── Entry point ───────────────────────────────────────────────────────────

    protected override async void OnStartup(StartupEventArgs e)
    {
        // Velopack must be the very first thing called.
        VelopackApp.Build().Run();

        base.OnStartup(e);

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
        _auth    = new AuthService(_settings.Current.ServerUrl);
        _liveKit = new LiveKitService();

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

        // Show main window.
        _mainWindow = new MainWindow(_liveKit, _settings, _session, _auth, _urlScheme);
        MainWindow  = _mainWindow;
        _mainWindow.Show();

        // If launched from a URL scheme, join the specified room immediately.
        if (urlRoomName is not null)
            _mainWindow.JoinRoom(urlRoomName);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _urlScheme.Dispose();
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
            LiveKitUrl = result.LiveKitUrl,
            Email      = _settings.Current.SavedEmail,
            SavedAt    = DateTimeOffset.UtcNow,
        });

        return true;
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
