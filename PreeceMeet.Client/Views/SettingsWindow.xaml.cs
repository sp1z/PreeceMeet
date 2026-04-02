using System.Windows;
using System.Windows.Controls;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class SettingsWindow : Window
{
    private readonly SettingsService _settingsService;
    private readonly SessionService  _sessionService;

    public bool SessionCleared { get; private set; }

    public SettingsWindow(SettingsService settingsService, SessionService sessionService)
    {
        _settingsService = settingsService;
        _sessionService  = sessionService;
        InitializeComponent();
        PopulateFields();
    }

    private void PopulateFields()
    {
        var s = _settingsService.Current;
        TxtServerUrl.Text     = s.ServerUrl;
        TxtLastRoom.Text      = s.LastRoomName;
        ChkRemember.IsChecked = s.RememberMe;

        PopulateDevices();
    }

    private async void PopulateDevices()
    {
        CmbCamera.Items.Add("Default");
        CmbMic.Items.Add("Default");

#if ENABLE_CAPTURE
        // Audio devices (synchronous via NAudio)
        foreach (var d in CaptureService.GetAudioDevices())
            CmbMic.Items.Add(d);

        // Video devices (async via WinRT)
        try
        {
            foreach (var d in await CaptureService.GetVideoDevicesAsync())
                CmbCamera.Items.Add(d);
        }
        catch { /* no camera or permission denied */ }

        SelectDeviceItem(CmbCamera, _settingsService.Current.SelectedCameraDevice);
        SelectDeviceItem(CmbMic,    _settingsService.Current.SelectedMicDevice);
#else
        CmbCamera.SelectedIndex = 0;
        CmbMic.SelectedIndex    = 0;
#endif
    }

#if ENABLE_CAPTURE
    private static void SelectDeviceItem(ComboBox combo, string value)
    {
        for (int i = 0; i < combo.Items.Count; i++)
        {
            var item = combo.Items[i] as DeviceInfo;
            if (item?.Id == value) { combo.SelectedIndex = i; return; }
        }
        combo.SelectedIndex = 0;
    }
#endif

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        var s = _settingsService.Current;
        s.ServerUrl            = TxtServerUrl.Text.Trim();
        s.LastRoomName         = TxtLastRoom.Text.Trim();
        s.RememberMe           = ChkRemember.IsChecked == true;
        s.SelectedCameraDevice = (CmbCamera.SelectedItem as DeviceInfo)?.Id ?? string.Empty;
        s.SelectedMicDevice    = (CmbMic.SelectedItem    as DeviceInfo)?.Id    ?? string.Empty;
        _settingsService.Save();
        DialogResult = true;
        Close();
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private void BtnSignOut_Click(object sender, RoutedEventArgs e)
    {
        var result = MessageBox.Show(
            "This will clear your saved session and require you to log in again. Continue?",
            "Sign Out", MessageBoxButton.YesNo, MessageBoxImage.Question);

        if (result == MessageBoxResult.Yes)
        {
            _sessionService.Clear();
            SessionCleared = true;
            DialogResult   = true;
            Close();
        }
    }
}
