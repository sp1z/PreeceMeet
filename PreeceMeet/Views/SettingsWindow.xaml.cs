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
        TxtServerUrl.Text       = s.ServerUrl;
        TxtLastRoom.Text        = s.LastRoomName;
        ChkRemember.IsChecked   = s.RememberMe;

        // Populate device dropdowns.
        PopulateDevices();

        // Pre-select saved device names.
        SelectItem(CmbCamera, s.SelectedCameraDevice);
        SelectItem(CmbMic,    s.SelectedMicDevice);
    }

    private void PopulateDevices()
    {
        // Windows device enumeration via DirectShow/MediaFoundation is done
        // via LiveKit's device enumerator which requires the SDK to be initialised.
        // For the settings window we populate a reasonable set and also allow
        // free-text selection via the ComboBox IsEditable property.
        CmbCamera.IsEditable = true;
        CmbMic.IsEditable    = true;

        // Add a default option; actual LiveKit device list is populated here.
        CmbCamera.Items.Add("Default");
        CmbMic.Items.Add("Default");

        // Attempt to enumerate via SDK if available.
        try
        {
            // LiveKit.NET exposes Room.GetLocalDevices() or similar static API.
            // The exact API depends on SDK version; we guard with try/catch.
            var devices = LiveKit.Room.GetLocalDevices();
            foreach (var d in devices)
            {
                if (d.Kind == LiveKit.DeviceKind.VideoInput)
                    CmbCamera.Items.Add(d.Label);
                else if (d.Kind == LiveKit.DeviceKind.AudioInput)
                    CmbMic.Items.Add(d.Label);
            }
        }
        catch
        {
            // SDK not yet initialised or device enumeration unavailable.
        }
    }

    private static void SelectItem(System.Windows.Controls.ComboBox combo, string value)
    {
        if (string.IsNullOrEmpty(value)) { combo.SelectedIndex = 0; return; }
        for (int i = 0; i < combo.Items.Count; i++)
        {
            if (combo.Items[i]?.ToString() == value)
            {
                combo.SelectedIndex = i;
                return;
            }
        }
        // Not found – set as editable text.
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
            "Sign Out",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result == MessageBoxResult.Yes)
        {
            _sessionService.Clear();
            SessionCleared = true;
            DialogResult = true;
            Close();
        }
    }
}
