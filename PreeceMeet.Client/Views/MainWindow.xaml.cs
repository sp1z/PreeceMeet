using System.Reflection;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class MainWindow : Window
{
    private readonly LiveKitService   _liveKit;
    private readonly SettingsService  _settings;
    private readonly SessionService   _session;
    private readonly AuthService      _auth;
    private readonly UrlSchemeService _urlScheme;
    private readonly AdminService     _adminService;

    private bool         _micMuted      = false;
    private bool         _camStopped    = false;
    private bool         _uiHidden      = false;
    private WindowState  _preFullscreen = WindowState.Normal;
    private WindowStyle  _preFullscreenStyle = WindowStyle.SingleBorderWindow;

    public event Action? SignOutRequested;

    public void ShowUpdateStatus(string msg)
        => Dispatcher.Invoke(() => TxtUpdateStatus.Text = msg);

    public MainWindow(
        LiveKitService liveKit,
        SettingsService settings,
        SessionService session,
        AuthService auth,
        UrlSchemeService urlScheme)
    {
        _liveKit      = liveKit;
        _settings     = settings;
        _session      = session;
        _auth         = auth;
        _urlScheme    = urlScheme;
        _adminService = new AdminService(settings.Current.ServerUrl);

        InitializeComponent();
        var ver = Assembly.GetExecutingAssembly().GetName().Version;
        Title = ver is not null ? $"PreeceMeet v{ver.Major}.{ver.Minor}.{ver.Build}" : "PreeceMeet";
        RestoreWindowBounds();

        TxtRoomName.Text = _settings.Current.LastRoomName;

        // Show admin button for @russellpreece.com accounts.
        var email = _session.Load()?.Email ?? string.Empty;
        if (email.EndsWith("@russellpreece.com", StringComparison.OrdinalIgnoreCase))
            BtnAdmin.Visibility = Visibility.Visible;

        _liveKit.Disconnected        += OnLiveKitDisconnected;
        _urlScheme.RoomJoinRequested += OnRoomJoinRequested;
    }

    public void JoinRoom(string roomName)
    {
        Dispatcher.Invoke(() =>
        {
            TxtRoomName.Text = roomName;
            _ = ConnectAsync(roomName);
        });
    }

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

        if (!double.IsNaN(s.WindowLeft) && !double.IsNaN(s.WindowTop) && IsOnScreen(s.WindowLeft, s.WindowTop))
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

    private static bool IsOnScreen(double left, double top)
    {
        var vLeft   = SystemParameters.VirtualScreenLeft;
        var vTop    = SystemParameters.VirtualScreenTop;
        var vRight  = vLeft + SystemParameters.VirtualScreenWidth;
        var vBottom = vTop  + SystemParameters.VirtualScreenHeight;
        return left >= vLeft && left < vRight && top >= vTop && top < vBottom;
    }

    private void SaveWindowBounds()
    {
        var s = _settings.Current;
        s.WindowWidth  = ActualWidth;
        s.WindowHeight = ActualHeight;
        s.WindowLeft   = Left;
        s.WindowTop    = Top;
    }

    private async void BtnJoin_Click(object sender, RoutedEventArgs e)
        => await ConnectAsync(TxtRoomName.Text.Trim());

    private void TxtRoomName_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Return)
            _ = ConnectAsync(TxtRoomName.Text.Trim());
    }

    private async void BtnDisconnect_Click(object sender, RoutedEventArgs e)
        => await DisconnectAsync();

    // ── Full screen ───────────────────────────────────────────────────────────

    private void BtnFullscreen_Click(object sender, RoutedEventArgs e) => ToggleFullscreen();

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.F11) ToggleFullscreen();
    }

    private void ToggleFullscreen()
    {
        if (WindowStyle == WindowStyle.None && WindowState == WindowState.Maximized)
        {
            WindowStyle = _preFullscreenStyle;
            WindowState = _preFullscreen;
            BtnFullscreen.Content = "\uE740";
            BtnFullscreen.ToolTip = "Full screen (F11)";
        }
        else
        {
            _preFullscreen      = WindowState;
            _preFullscreenStyle = WindowStyle;
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
            BtnFullscreen.Content = "\uE923";
            BtnFullscreen.ToolTip = "Exit full screen (F11)";
        }
    }

    // ── Hide / show UI ────────────────────────────────────────────────────────

    private void BtnHideUI_Click(object sender, RoutedEventArgs e) => SetUIHidden(true);

    private void PnlRevealBar_Click(object sender, System.Windows.Input.MouseButtonEventArgs e) => SetUIHidden(false);

    private void SetUIHidden(bool hide)
    {
        _uiHidden = hide;
        var vis = hide ? Visibility.Collapsed : Visibility.Visible;
        PnlTopBar.Visibility      = vis;
        PnlCallControls.Visibility = vis;
        PnlRevealBar.Visibility   = hide ? Visibility.Visible : Visibility.Collapsed;
    }

    private void BtnAdmin_Click(object sender, RoutedEventArgs e)
    {
        var win = new AdminWindow(_adminService, _settings) { Owner = this };
        win.ShowDialog();
    }

    private void BtnLayoutToggle_Click(object sender, RoutedEventArgs e)
    {
        bool nowStrip = _settings.Current.LayoutMode != "Strip";
        _settings.Current.LayoutMode = nowStrip ? "Strip" : "Grid";
        _settings.Save();
        VideoGrid.SetStripMode(nowStrip);
        BtnLayoutToggle.ToolTip = nowStrip ? "Switch to grid layout" : "Switch to strip layout";
        // In strip mode make the window compact; restore on grid mode.
        if (nowStrip)
        {
            Height    = 200;
            MinHeight = 80;
        }
        else
        {
            MinHeight = 0;
            if (Height < 400) Height = 600;
        }
    }

    private void BtnSettings_Click(object sender, RoutedEventArgs e)
    {
        var win = new SettingsWindow(_settings, _session) { Owner = this };
        if (win.ShowDialog() == true && win.SessionCleared)
            SignOutRequested?.Invoke();
    }

    private static readonly SolidColorBrush _mutedBrush   = new(Color.FromRgb(0xE5, 0x39, 0x35));
    private static readonly SolidColorBrush _defaultBrush = new(Color.FromRgb(0x3a, 0x3a, 0x5c));

    private async void BtnToggleMic_Click(object sender, RoutedEventArgs e)
    {
        _micMuted = !_micMuted;
        await _liveKit.SetMicrophoneEnabledAsync(!_micMuted);
        BtnToggleMic.Background = _micMuted ? _mutedBrush : _defaultBrush;
        BtnToggleMic.ToolTip    = _micMuted ? "Unmute microphone" : "Mute microphone";
    }

    private async void BtnToggleCam_Click(object sender, RoutedEventArgs e)
    {
        _camStopped = !_camStopped;
        await _liveKit.SetCameraEnabledAsync(!_camStopped);
        BtnToggleCam.Background = _camStopped ? _mutedBrush : _defaultBrush;
        BtnToggleCam.ToolTip    = _camStopped ? "Start camera" : "Stop camera";
    }

    private async void BtnHangup_Click(object sender, RoutedEventArgs e)
        => await DisconnectAsync();

    private async Task ConnectAsync(string roomName)
    {
        if (string.IsNullOrEmpty(roomName))
        {
            MessageBox.Show("Please enter a room name.", "PreeceMeet", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        ShowStatus("Connecting...", $"Room: {roomName}");

        try
        {
            var savedSession = _session.Load();
            if (savedSession is null || string.IsNullOrEmpty(savedSession.LiveKitToken))
            {
                MessageBox.Show("No active session. Please restart and log in again.",
                    "PreeceMeet", MessageBoxButton.OK, MessageBoxImage.Warning);
                HideStatus();
                return;
            }

            ShowStatus("Connecting...", $"Room: {roomName}");
            await _liveKit.ConnectAsync(savedSession.LiveKitUrl, savedSession.LiveKitToken, _settings.Current);

            VideoGrid.Initialize(_liveKit.RemoteParticipants, _liveKit.LocalParticipant, _liveKit, _settings);
            VideoGrid.SetStripMode(_settings.Current.LayoutMode == "Strip");
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
        => Dispatcher.Invoke(() => { VideoGrid.Clear(); SetConnectedState(false); });

    private void OnRoomJoinRequested(string roomName)
        => Dispatcher.Invoke(() => { Activate(); TxtRoomName.Text = roomName; _ = ConnectAsync(roomName); });

    private void SetConnectedState(bool connected)
    {
        BtnDisconnect.Visibility = connected ? Visibility.Visible : Visibility.Collapsed;
        PnlEmptyState.Visibility = connected ? Visibility.Collapsed : Visibility.Visible;
        VideoGrid.Visibility     = connected ? Visibility.Visible : Visibility.Collapsed;
        BtnJoin.IsEnabled        = !connected;
    }

    private void ShowStatus(string title, string subtitle = "")
    {
        TxtStatus.Text           = title;
        TxtStatusSub.Text        = subtitle;
        PnlStatus.Visibility     = Visibility.Visible;
        PnlEmptyState.Visibility = Visibility.Collapsed;
    }

    private void HideStatus()
        => PnlStatus.Visibility = Visibility.Collapsed;
}
