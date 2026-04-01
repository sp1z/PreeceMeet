using System.Windows;
using System.Windows.Input;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class MainWindow : Window
{
    private readonly LiveKitService  _liveKit;
    private readonly SettingsService _settings;
    private readonly SessionService  _session;
    private readonly AuthService     _auth;
    private readonly UrlSchemeService _urlScheme;

    private bool _micMuted = false;
    private bool _camStopped = false;

    public MainWindow(
        LiveKitService liveKit,
        SettingsService settings,
        SessionService session,
        AuthService auth,
        UrlSchemeService urlScheme)
    {
        _liveKit   = liveKit;
        _settings  = settings;
        _session   = session;
        _auth      = auth;
        _urlScheme = urlScheme;

        InitializeComponent();
        RestoreWindowBounds();

        TxtRoomName.Text = _settings.Current.LastRoomName;

        _liveKit.Disconnected += OnLiveKitDisconnected;
        _urlScheme.RoomJoinRequested += OnRoomJoinRequested;
    }

    // ── Public: join a specific room (called from App on URL scheme activation) ─

    public void JoinRoom(string roomName)
    {
        Dispatcher.Invoke(() =>
        {
            TxtRoomName.Text = roomName;
            _ = ConnectAsync(roomName);
        });
    }

    // ── Window events ─────────────────────────────────────────────────────────

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        SaveWindowBounds();
        _settings.Current.LastRoomName = TxtRoomName.Text.Trim();
        _settings.Save();
        _ = _liveKit.DisconnectAsync();
    }

    private void RestoreWindowBounds()
    {
        var s = _settings.Current;
        Width  = s.WindowWidth  > 0 ? s.WindowWidth  : 1200;
        Height = s.WindowHeight > 0 ? s.WindowHeight : 750;

        if (!double.IsNaN(s.WindowLeft) && !double.IsNaN(s.WindowTop))
        {
            Left = s.WindowLeft;
            Top  = s.WindowTop;
            WindowStartupLocation = WindowStartupLocation.Manual;
        }
        else
        {
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
        }
    }

    private void SaveWindowBounds()
    {
        var s = _settings.Current;
        s.WindowWidth  = ActualWidth;
        s.WindowHeight = ActualHeight;
        s.WindowLeft   = Left;
        s.WindowTop    = Top;
    }

    // ── Toolbar buttons ───────────────────────────────────────────────────────

    private async void BtnJoin_Click(object sender, RoutedEventArgs e)
        => await ConnectAsync(TxtRoomName.Text.Trim());

    private void TxtRoomName_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Return)
            _ = ConnectAsync(TxtRoomName.Text.Trim());
    }

    private async void BtnDisconnect_Click(object sender, RoutedEventArgs e)
        => await DisconnectAsync();

    private void BtnSettings_Click(object sender, RoutedEventArgs e)
    {
        var win = new SettingsWindow(_settings, _session) { Owner = this };
        if (win.ShowDialog() == true && win.SessionCleared)
        {
            // User signed out – redirect to login on next restart (or immediately).
            Application.Current.Shutdown();
        }
    }

    // ── Bottom bar ────────────────────────────────────────────────────────────

    private async void BtnToggleMic_Click(object sender, RoutedEventArgs e)
    {
        _micMuted = !_micMuted;
        await _liveKit.SetMicrophoneEnabledAsync(!_micMuted);
        BtnToggleMic.Content = _micMuted ? "🎤 Unmute" : "🎤 Mute";
    }

    private async void BtnToggleCam_Click(object sender, RoutedEventArgs e)
    {
        _camStopped = !_camStopped;
        await _liveKit.SetCameraEnabledAsync(!_camStopped);
        BtnToggleCam.Content = _camStopped ? "📹 Start Video" : "📹 Stop Video";
    }

    private async void BtnHangup_Click(object sender, RoutedEventArgs e)
        => await DisconnectAsync();

    // ── Connection logic ──────────────────────────────────────────────────────

    private async Task ConnectAsync(string roomName)
    {
        if (string.IsNullOrEmpty(roomName))
        {
            MessageBox.Show("Please enter a room name.", "PreeceMeet", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        ShowStatus("Connecting…", $"Room: {roomName}");

        try
        {
            // Obtain a fresh LiveKit token via saved session.
            var savedSession = _session.Load();
            if (savedSession is null)
            {
                MessageBox.Show("No active session. Please restart the application and log in.",
                    "PreeceMeet", MessageBoxButton.OK, MessageBoxImage.Warning);
                HideStatus();
                return;
            }

            ShowStatus("Authenticating…", "Obtaining room token…");
            var refresh = await _auth.RefreshTokenAsync(savedSession.SessionToken, roomName);

            ShowStatus("Connecting…", $"Room: {roomName}");
            await _liveKit.ConnectAsync(refresh.LiveKitUrl, refresh.LiveKitToken);

            // Connected – update UI.
            VideoGrid.Initialize(_liveKit.RemoteParticipants, _liveKit.LocalParticipant);

            _settings.Current.LastRoomName = roomName;
            _settings.Save();

            SetConnectedState(true);
            HideStatus();
        }
        catch (Exception ex)
        {
            HideStatus();
            SetConnectedState(false);
            MessageBox.Show($"Failed to connect: {ex.Message}", "PreeceMeet",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task DisconnectAsync()
    {
        await _liveKit.DisconnectAsync();
        VideoGrid.Clear();
        SetConnectedState(false);
    }

    private void OnLiveKitDisconnected()
    {
        Dispatcher.Invoke(() =>
        {
            VideoGrid.Clear();
            SetConnectedState(false);
        });
    }

    private void OnRoomJoinRequested(string roomName)
    {
        Dispatcher.Invoke(() =>
        {
            Activate();
            TxtRoomName.Text = roomName;
            _ = ConnectAsync(roomName);
        });
    }

    // ── UI state helpers ──────────────────────────────────────────────────────

    private void SetConnectedState(bool connected)
    {
        BtnDisconnect.Visibility = connected ? Visibility.Visible : Visibility.Collapsed;
        PnlEmptyState.Visibility = connected ? Visibility.Collapsed : Visibility.Visible;
        VideoGrid.Visibility     = connected ? Visibility.Visible : Visibility.Collapsed;
        BtnJoin.IsEnabled        = !connected;
    }

    private void ShowStatus(string title, string subtitle = "")
    {
        TxtStatus.Text    = title;
        TxtStatusSub.Text = subtitle;
        PnlStatus.Visibility    = Visibility.Visible;
        PnlEmptyState.Visibility = Visibility.Collapsed;
    }

    private void HideStatus()
        => PnlStatus.Visibility = Visibility.Collapsed;
}
