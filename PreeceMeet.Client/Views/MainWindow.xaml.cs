using System.Reflection;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using PreeceMeet.Models;
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
    private readonly RoomService      _roomService;

    private bool        _micMuted          = false;
    private bool        _camStopped        = false;
    private bool        _uiHidden          = false;
    private bool        _isSwitchingRooms  = false;
    private bool        _statsVisible      = false;
    private WindowState _preFullscreen = WindowState.Normal;
    private WindowStyle _preFullscreenStyle = WindowStyle.SingleBorderWindow;
    private Storyboard? _spinnerStoryboard;

    private ChannelInfo? _activeChannel;

    public event Action? SignOutRequested;

    public void ShowUpdateStatus(string msg)
        => Dispatcher.Invoke(() => TxtUpdateStatus.Text = msg);

    public MainWindow(
        LiveKitService liveKit,
        SettingsService settings,
        SessionService session,
        AuthService auth,
        UrlSchemeService urlScheme,
        RoomService roomService)
    {
        _liveKit      = liveKit;
        _settings     = settings;
        _session      = session;
        _auth         = auth;
        _urlScheme    = urlScheme;
        _roomService  = roomService;

        var livekitToken = session.Load()?.LiveKitToken ?? string.Empty;
        _adminService = new AdminService(settings.Current.ServerUrl, livekitToken);

        InitializeComponent();

        var ver = Assembly.GetExecutingAssembly().GetName().Version;
        Title = ver is not null ? $"PreeceMeet v{ver.Major}.{ver.Minor}.{ver.Build}" : "PreeceMeet";

        RestoreWindowBounds();

        // Sidebar
        Sidebar.BindChannels(_roomService.Channels);
        var email = session.Load()?.Email ?? string.Empty;
        Sidebar.SetUser(email);
        Sidebar.ChannelJoinRequested   += OnChannelJoinRequested;
        Sidebar.AddChannelRequested    += OnAddChannelRequested;
        Sidebar.ChannelEditRequested   += OnChannelEditRequested;
        Sidebar.ChannelDeleteRequested += OnChannelDeleteRequested;
        Sidebar.SettingsRequested      += () => OpenSettings();
        Sidebar.SignOutRequested       += OnSignOutFromSidebar;

        // Apply saved sidebar visibility.
        SetSidebarVisible(_settings.Current.SidebarVisible);

        // Show admin button for @russellpreece.com accounts.
        if (email.EndsWith("@russellpreece.com", StringComparison.OrdinalIgnoreCase))
            BtnAdmin.Visibility = Visibility.Visible;

        _liveKit.Disconnected        += OnLiveKitDisconnected;
        _urlScheme.RoomJoinRequested += OnRoomJoinRequested;
        VideoGrid.TileCountChanged   += OnTileCountChanged;

        // Restore Game Mode if it was active when we last closed (also accept old "Strip" value).
        if (_settings.Current.LayoutMode is "GameMode" or "Strip")
            EnterGameMode();
    }

    // ── Join from URL scheme ──────────────────────────────────────────────────

    public void JoinRoom(string roomName)
    {
        Dispatcher.Invoke(() => _ = ConnectToChannelAsync(roomName));
    }

    // ── Window lifecycle ──────────────────────────────────────────────────────

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        SaveWindowBounds();
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

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.F11)
        {
            ToggleFullscreen();
            return;
        }

        if (e.KeyboardDevice.Modifiers == ModifierKeys.Control)
        {
            switch (e.Key)
            {
                case Key.M: _ = ToggleMicAsync();  e.Handled = true; break;
                case Key.E: _ = ToggleCamAsync();  e.Handled = true; break;
                case Key.D: _ = DisconnectAsync(); e.Handled = true; break;
            }
        }
    }

    // ── Top-bar buttons ───────────────────────────────────────────────────────

    private void BtnToggleSidebar_Click(object sender, RoutedEventArgs e)
    {
        var visible = ColSidebar.Width.Value == 0;
        SetSidebarVisible(visible);
        _settings.Current.SidebarVisible = visible;
        _settings.Save();
    }

    private void SetSidebarVisible(bool visible)
    {
        ColSidebar.Width   = visible ? new GridLength(200) : new GridLength(0);
        Sidebar.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    }

    // ── Full screen ───────────────────────────────────────────────────────────

    private void BtnFullscreen_Click(object sender, RoutedEventArgs e) => ToggleFullscreen();

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
        PnlTopBar.Visibility       = vis;
        PnlCallControls.Visibility = vis;
        PnlRevealBar.Visibility    = hide ? Visibility.Visible : Visibility.Collapsed;
    }

    // ── Stats panel ───────────────────────────────────────────────────────────

    private void BtnStats_Click(object sender, RoutedEventArgs e)
    {
        _statsVisible = !_statsVisible;
        BtnStats.ToolTip = _statsVisible ? "Hide debug stats panel" : "Show debug stats panel";
        BtnStats.Opacity = _statsVisible ? 1.0 : 0.6;
        VideoGrid.SetStatsVisible(_statsVisible, _liveKit, _settings.Current.ServerUrl);

        // In game mode, the window width needs to update for the new tile count.
        if (_settings.Current.LayoutMode == "GameMode")
            ResizeForGameMode(VideoGrid.TileCount);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    private void BtnAdmin_Click(object sender, RoutedEventArgs e)
    {
        var win = new AdminWindow(_adminService) { Owner = this };
        win.ShowDialog();
    }

    // ── Game Mode (strip layout) ──────────────────────────────────────────────

    private void BtnLayoutToggle_Click(object sender, RoutedEventArgs e)
    {
        if (_settings.Current.LayoutMode == "GameMode")
            ExitGameMode();
        else
            EnterGameMode();
    }

    private void EnterGameMode()
    {
        _settings.Current.LayoutMode = "GameMode";
        _settings.Save();

        VideoGrid.SetStripMode(true);
        SetSidebarVisible(false);
        SetUIHidden(true);

        BtnLayoutToggle.ToolTip = "Exit Game Mode";

        // Size window to current tile count (SetStripMode triggers TileCountChanged too, but do
        // an immediate resize here so the window snaps before the dispatcher round-trip).
        ResizeForGameMode(Math.Max(1, VideoGrid.TileCount));
    }

    private void ExitGameMode()
    {
        _settings.Current.LayoutMode = "Grid";
        _settings.Save();

        VideoGrid.SetStripMode(false);
        SetSidebarVisible(_settings.Current.SidebarVisible);
        SetUIHidden(false);

        BtnLayoutToggle.ToolTip = "Game Mode";
        if (Height < 400) Height = 600;
    }

    private void ResizeForGameMode(int tileCount)
    {
        int tileH = _settings.Current.GameModeTileHeight > 0
            ? _settings.Current.GameModeTileHeight : 200;

        double tileW = tileH * 16.0 / 9.0;
        int    count = Math.Max(1, tileCount);

        double chrome = SystemParameters.WindowCaptionHeight
                      + SystemParameters.ResizeFrameHorizontalBorderHeight * 2;

        Height = tileH + chrome;
        Width  = count * tileW;
    }

    private void OnTileCountChanged(int count)
    {
        if (_settings.Current.LayoutMode != "GameMode") return;
        Dispatcher.BeginInvoke(() => ResizeForGameMode(count));
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    private void BtnSettings_Click(object sender, RoutedEventArgs e) => OpenSettings();

    private void OpenSettings()
    {
        var win = new SettingsWindow(_settings, _session) { Owner = this };
        if (win.ShowDialog() == true)
            _roomService.RebuildFromSettings();
    }

    private void OnSignOutFromSidebar()
    {
        var result = MessageBox.Show(
            "This will clear your saved session and require you to log in again. Continue?",
            "Sign Out", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result == MessageBoxResult.Yes)
        {
            _session.Clear();
            SignOutRequested?.Invoke();
        }
    }

    // ── Mic / cam ─────────────────────────────────────────────────────────────

    private static readonly SolidColorBrush _mutedBrush   = new(Color.FromRgb(0xE5, 0x39, 0x35));
    private static readonly SolidColorBrush _defaultBrush = new(Color.FromRgb(0x3a, 0x3a, 0x5c));

    private async void BtnToggleMic_Click(object sender, RoutedEventArgs e) => await ToggleMicAsync();
    private async void BtnToggleCam_Click(object sender, RoutedEventArgs e) => await ToggleCamAsync();

    private async Task ToggleMicAsync()
    {
        _micMuted = !_micMuted;
        await _liveKit.SetMicrophoneEnabledAsync(!_micMuted);
        BtnToggleMic.Background = _micMuted ? _mutedBrush : _defaultBrush;
        BtnToggleMic.ToolTip    = _micMuted ? "Unmute microphone (Ctrl+M)" : "Mute microphone (Ctrl+M)";
    }

    private async Task ToggleCamAsync()
    {
        _camStopped = !_camStopped;
        await _liveKit.SetCameraEnabledAsync(!_camStopped);
        BtnToggleCam.Background = _camStopped ? _mutedBrush : _defaultBrush;
        BtnToggleCam.ToolTip    = _camStopped ? "Start camera (Ctrl+E)" : "Stop camera (Ctrl+E)";
    }

    // ── Hang up ───────────────────────────────────────────────────────────────

    private async void BtnHangup_Click(object sender, RoutedEventArgs e) => await DisconnectAsync();

    // ── Channel sidebar events ────────────────────────────────────────────────

    private void OnChannelJoinRequested(ChannelInfo ch)
    {
        if (_activeChannel?.Name == ch.Name) return; // already there
        _ = ConnectToChannelAsync(ch.Name);
    }

    private void OnAddChannelRequested()
    {
        var dlg = new AddChannelDialog { Owner = this };
        if (dlg.ShowDialog() != true || string.IsNullOrWhiteSpace(dlg.ChannelName)) return;

        var name    = dlg.ChannelName;
        var display = string.IsNullOrWhiteSpace(dlg.DisplayName) ? name : dlg.DisplayName;

        if (_settings.Current.Channels.Any(c => c.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
        {
            MessageBox.Show("That channel already exists.", "PreeceMeet", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        _settings.Current.Channels.Add(new ChannelConfig { Name = name, DisplayName = display, Emoji = dlg.Emoji });
        _settings.Save();
        _roomService.RebuildFromSettings();
    }

    private void OnChannelEditRequested(ChannelInfo ch)
    {
        var cfg = _settings.Current.Channels.FirstOrDefault(c =>
            c.Name.Equals(ch.Name, StringComparison.OrdinalIgnoreCase));
        if (cfg is null) return;

        var dlg = new AddChannelDialog(cfg) { Owner = this };
        if (dlg.ShowDialog() != true) return;

        cfg.DisplayName = string.IsNullOrWhiteSpace(dlg.DisplayName) ? cfg.Name : dlg.DisplayName;
        cfg.Emoji       = dlg.Emoji;
        _settings.Save();
        _roomService.RebuildFromSettings();
    }

    private void OnChannelDeleteRequested(ChannelInfo ch)
    {
        var result = MessageBox.Show($"Delete #{ch.DisplayName}?", "PreeceMeet",
            MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result != MessageBoxResult.Yes) return;

        _settings.Current.Channels.RemoveAll(c =>
            c.Name.Equals(ch.Name, StringComparison.OrdinalIgnoreCase));

        // Clear auto-join if it was this channel.
        if (_settings.Current.AutoJoinChannel.Equals(ch.Name, StringComparison.OrdinalIgnoreCase))
            _settings.Current.AutoJoinChannel = string.Empty;

        _settings.Save();
        _roomService.RebuildFromSettings();

        // Disconnect if we were in this channel.
        if (_activeChannel?.Name.Equals(ch.Name, StringComparison.OrdinalIgnoreCase) == true)
            _ = DisconnectAsync();
    }

    // ── Connect / disconnect ──────────────────────────────────────────────────

    private async Task ConnectToChannelAsync(string channelName)
    {
        ShowStatus("Connecting...", $"Joining #{channelName}", showSteps: true);
        SetStep(1);

        try
        {
            // Detect old sessions that pre-date the session token (require re-login once).
            if (string.IsNullOrEmpty(_session.Load()?.SessionToken))
            {
                HideStatus();
                var r = MessageBox.Show(
                    "Your session needs to be refreshed. Please sign out and sign back in.",
                    "PreeceMeet — Session Refresh Required",
                    MessageBoxButton.OKCancel, MessageBoxImage.Information);
                if (r == MessageBoxResult.OK) OnSignOutFromSidebar();
                return;
            }

            var displayName = _settings.Current.DisplayName.NullIfEmpty();
            var tokenResp   = await _roomService.GetRoomTokenAsync(channelName, displayName);

            if (tokenResp is null || string.IsNullOrEmpty(tokenResp.LiveKitToken))
            {
                HideStatus();
                MessageBox.Show("Could not obtain a room token. Please check your connection.",
                    "PreeceMeet", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            SetStep(2);
            TxtStatus.Text = "Starting devices...";

            if (_activeChannel is not null)
            {
                _isSwitchingRooms = true;
                await _liveKit.DisconnectAsync();
                _isSwitchingRooms = false;
                VideoGrid.Clear();
            }

            SetStep(3);
            TxtStatus.Text = "Joining room...";

            await _liveKit.ConnectAsync(tokenResp.LiveKitUrl, tokenResp.LiveKitToken, _settings.Current);

            SetStep(4); // all done

            // Update sidebar active state.
            var ch = _roomService.Channels.FirstOrDefault(c =>
                c.Name.Equals(channelName, StringComparison.OrdinalIgnoreCase));
            _activeChannel = ch;
            Sidebar.SetActiveChannel(ch);

            TxtCurrentRoom.Text = $"#{channelName}";

            VideoGrid.Initialize(_liveKit.RemoteParticipants, _liveKit.LocalParticipant, _liveKit, _settings);
            VideoGrid.SetStripMode(_settings.Current.LayoutMode == "Strip");

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
        Sidebar.SetActiveChannel(null);
        _activeChannel = null;
        TxtCurrentRoom.Text = "No active call";
        SetConnectedState(false);
    }

    private void OnLiveKitDisconnected()
        => Dispatcher.Invoke(() =>
        {
            if (_isSwitchingRooms) return;
            VideoGrid.Clear();
            Sidebar.SetActiveChannel(null);
            _activeChannel = null;
            TxtCurrentRoom.Text = "No active call";
            SetConnectedState(false);
        });

    private void OnRoomJoinRequested(string roomName)
        => Dispatcher.Invoke(() => { Activate(); _ = ConnectToChannelAsync(roomName); });

    private void SetConnectedState(bool connected)
    {
        BtnHangup.IsEnabled          = connected;
        PnlEmptyState.Visibility     = connected ? Visibility.Collapsed : Visibility.Visible;
        VideoGrid.Visibility         = connected ? Visibility.Visible   : Visibility.Collapsed;
        BtnDisconnect.Visibility     = connected ? Visibility.Visible   : Visibility.Collapsed;
    }

    private void ShowStatus(string title, string subtitle = "", bool showSteps = false)
    {
        TxtStatus.Text           = title;
        TxtStatusSub.Text        = subtitle;
        PnlStatus.Visibility     = Visibility.Visible;
        PnlEmptyState.Visibility = Visibility.Collapsed;
        PnlStatusSteps.Visibility = showSteps ? Visibility.Visible : Visibility.Collapsed;

        // Start spinner animation.
        StartSpinner();
    }

    private void SetStep(int step)
    {
        const string checkmark = "✓";  // U+2713
        const string active    = "●";  // U+25CF
        const string pending   = "○";  // U+25CB

        var completedColor = new SolidColorBrush(Color.FromRgb(0x23, 0xd1, 0x8b)); // green
        var activeColor    = new SolidColorBrush(Color.FromRgb(0xe3, 0xe5, 0xe8)); // white
        var inactiveColor  = new SolidColorBrush(Color.FromRgb(0x55, 0x55, 0x55)); // dim

        // Step 1
        if (step > 1) { TxtStep1.Text = $"{checkmark}  Authenticated";    TxtStep1.Foreground = completedColor; }
        else if (step == 1) { TxtStep1.Text = $"{active}  Authenticating"; TxtStep1.Foreground = activeColor; }

        // Step 2
        if (step > 2) { TxtStep2.Text = $"{checkmark}  Devices ready";       TxtStep2.Foreground = completedColor; }
        else if (step == 2) { TxtStep2.Text = $"{active}  Starting devices";  TxtStep2.Foreground = activeColor; }
        else { TxtStep2.Text = $"{pending}  Starting devices"; TxtStep2.Foreground = inactiveColor; }

        // Step 3
        if (step > 3) { TxtStep3.Text = $"{checkmark}  Connected";         TxtStep3.Foreground = completedColor; }
        else if (step == 3) { TxtStep3.Text = $"{active}  Joining room";   TxtStep3.Foreground = activeColor; }
        else { TxtStep3.Text = $"{pending}  Joining room"; TxtStep3.Foreground = inactiveColor; }
    }

    private void HideStatus()
    {
        PnlStatus.Visibility = Visibility.Collapsed;
        StopSpinner();
    }

    private void StartSpinner()
    {
        if (_spinnerStoryboard is not null) return;
        var anim = new DoubleAnimation(0, 360, TimeSpan.FromSeconds(1.2))
        {
            RepeatBehavior = RepeatBehavior.Forever,
        };
        _spinnerStoryboard = new Storyboard();
        _spinnerStoryboard.Children.Add(anim);
        Storyboard.SetTarget(anim, SpinnerArc);
        Storyboard.SetTargetProperty(anim, new PropertyPath("RenderTransform.Angle"));
        _spinnerStoryboard.Begin();
    }

    private void StopSpinner()
    {
        _spinnerStoryboard?.Stop();
        _spinnerStoryboard = null;
    }

    // ── Update overlay ───────────────────────────────────────────────────────

    public void ShowUpdateOverlay(string detail, int percent)
    {
        Dispatcher.Invoke(() =>
        {
            PnlUpdateOverlay.Visibility = Visibility.Visible;
            TxtUpdateDetail.Text        = detail;
            TxtUpdatePercent.Text = $"{percent}%";
            ProgressScale.ScaleX  = percent / 100.0;
        });
    }

    public void ShowUpdateRestarting()
    {
        Dispatcher.Invoke(() =>
        {
            TxtUpdateTitle.Text   = "Restarting...";
            TxtUpdateDetail.Text  = "Applying update and restarting PreeceMeet";
            TxtUpdatePercent.Text = "";
            ProgressScale.ScaleX  = 1.0;
        });
    }

    public void HideUpdateOverlay()
        => Dispatcher.Invoke(() => PnlUpdateOverlay.Visibility = Visibility.Collapsed);
}

// ── String helper ─────────────────────────────────────────────────────────────

static class StringExtensions2
{
    public static string? NullIfEmpty(this string? s) =>
        string.IsNullOrWhiteSpace(s) ? null : s;
}
