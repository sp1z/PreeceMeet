using System.Windows;
using System.Windows.Controls;
using PreeceMeet.Models;
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
        TxtDisplayName.Text   = s.DisplayName;
        TxtServerUrl.Text     = s.ServerUrl;
        TxtLastRoom.Text      = s.LastRoomName;

        PopulateDevices();
    }

    private async void PopulateDevices()
    {
        CmbCamera.Items.Add("Default");
        CmbMic.Items.Add("Default");
        CmbSpeaker.Items.Add("Default");

        // Audio input devices (synchronous via NAudio)
        foreach (var d in CaptureService.GetAudioDevices())
            CmbMic.Items.Add(d);

        // Audio output devices
        foreach (var d in AudioPlaybackService.GetOutputDevices())
            CmbSpeaker.Items.Add(d);

        // Video devices (async)
        try
        {
            foreach (var d in await CaptureService.GetVideoDevicesAsync())
                CmbCamera.Items.Add(d);
        }
        catch { /* no camera or permission denied */ }

        var s = _settingsService.Current;
        SelectDeviceItem(CmbCamera,  s.SelectedCameraDevice,  s.SelectedCameraDeviceName);
        SelectDeviceItem(CmbMic,     s.SelectedMicDevice,     s.SelectedMicDeviceName);
        SelectDeviceItem(CmbSpeaker, s.SelectedSpeakerDevice, s.SelectedSpeakerDeviceName);
    }

    /// <summary>
    /// Select a device by ID first; if not found, fall back to matching by name.
    /// Windows frequently reassigns device IDs (especially numeric indices for
    /// audio devices) when USB devices are reconnected or new devices appear.
    /// Name-based fallback ensures the user's chosen device stays "pinned".
    /// </summary>
    private static void SelectDeviceItem(ComboBox combo, string savedId, string savedName)
    {
        if (string.IsNullOrWhiteSpace(savedId) && string.IsNullOrWhiteSpace(savedName))
        {
            combo.SelectedIndex = 0;
            return;
        }

        // Try exact ID match first.
        for (int i = 0; i < combo.Items.Count; i++)
        {
            if (combo.Items[i] is DeviceInfo d && d.Id == savedId)
            {
                combo.SelectedIndex = i;
                return;
            }
        }

        // Fallback: match by device name (robust when Windows reassigns IDs).
        if (!string.IsNullOrWhiteSpace(savedName))
        {
            for (int i = 0; i < combo.Items.Count; i++)
            {
                if (combo.Items[i] is DeviceInfo d &&
                    string.Equals(d.Name, savedName, StringComparison.OrdinalIgnoreCase))
                {
                    combo.SelectedIndex = i;
                    return;
                }
            }

            // Partial name match as last resort (device names can be truncated).
            for (int i = 0; i < combo.Items.Count; i++)
            {
                if (combo.Items[i] is DeviceInfo d &&
                    !string.IsNullOrWhiteSpace(d.Name) &&
                    (d.Name.Contains(savedName, StringComparison.OrdinalIgnoreCase) ||
                     savedName.Contains(d.Name, StringComparison.OrdinalIgnoreCase)))
                {
                    combo.SelectedIndex = i;
                    return;
                }
            }
        }

        combo.SelectedIndex = 0;
    }

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        var s = _settingsService.Current;
        s.DisplayName           = TxtDisplayName.Text.Trim();
        s.ServerUrl             = TxtServerUrl.Text.Trim();
        s.LastRoomName          = TxtLastRoom.Text.Trim();
        var cam     = CmbCamera.SelectedItem  as DeviceInfo;
        var mic     = CmbMic.SelectedItem      as DeviceInfo;
        var speaker = CmbSpeaker.SelectedItem as DeviceInfo;

        s.SelectedCameraDevice      = cam?.Id     ?? string.Empty;
        s.SelectedCameraDeviceName  = cam?.Name   ?? string.Empty;
        s.SelectedMicDevice         = mic?.Id     ?? string.Empty;
        s.SelectedMicDeviceName     = mic?.Name   ?? string.Empty;
        s.SelectedSpeakerDevice     = speaker?.Id ?? string.Empty;
        s.SelectedSpeakerDeviceName = speaker?.Name ?? string.Empty;

        _settingsService.Save();
        DialogResult = true;
        Close();
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

}
