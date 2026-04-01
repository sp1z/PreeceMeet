using System.Windows;
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
        SelectItem(CmbCamera, s.SelectedCameraDevice);
        SelectItem(CmbMic,    s.SelectedMicDevice);
    }

    private void PopulateDevices()
    {
        CmbCamera.IsEditable = true;
        CmbMic.IsEditable    = true;
        CmbCamera.Items.Add("Default");
        CmbMic.Items.Add("Default");

        // Device enumeration via Livekit.Rtc.Dotnet is not yet supported;
        // users select their device via the OS default or the Settings fields.
    }

    private static void SelectItem(System.Windows.Controls.ComboBox combo, string value)
    {
        if (string.IsNullOrEmpty(value)) { combo.SelectedIndex = 0; return; }
        for (int i = 0; i < combo.Items.Count; i++)
            if (combo.Items[i]?.ToString() == value) { combo.SelectedIndex = i; return; }
        combo.Text = value;
    }

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        var s = _settingsService.Current;
        s.ServerUrl            = TxtServerUrl.Text.Trim();
        s.LastRoomName         = TxtLastRoom.Text.Trim();
        s.RememberMe           = ChkRemember.IsChecked == true;
        s.SelectedCameraDevice = CmbCamera.Text;
        s.SelectedMicDevice    = CmbMic.Text;
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
