using System.Windows;
using System.Windows.Controls;
using PreeceMeet.Models;
using PreeceMeet.Services;

namespace PreeceMeet.Views;

public partial class SettingsWindow : Window
{
    private readonly SettingsService _settingsService;
    private readonly SessionService  _sessionService;

    // Working copy of channels — edited in-place, committed on Save.
    private List<ChannelConfig> _channels = new();

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
        TxtDisplayName.Text = s.DisplayName;
        TxtServerUrl.Text   = s.ServerUrl;

        // Deep-copy channels so edits don't affect live sidebar until saved.
        _channels = s.Channels.Select(c => new ChannelConfig
            { Name = c.Name, DisplayName = c.DisplayName, Emoji = c.Emoji }).ToList();

        RefreshChannelList();
        PopulateAutoJoin(s.AutoJoinChannel);
        PopulateDevices();
    }

    private void RefreshChannelList()
    {
        ChannelListControl.ItemsSource = null;
        ChannelListControl.ItemsSource = _channels;

        // Rebuild auto-join combo whenever channels change.
        var current = (CmbAutoJoin.SelectedItem as string) ?? string.Empty;
        PopulateAutoJoin(current);
    }

    private void PopulateAutoJoin(string selectedName)
    {
        CmbAutoJoin.Items.Clear();
        CmbAutoJoin.Items.Add("(none)");
        foreach (var ch in _channels)
            CmbAutoJoin.Items.Add(ch.Name);

        var idx = _channels.FindIndex(c =>
            c.Name.Equals(selectedName, StringComparison.OrdinalIgnoreCase));
        CmbAutoJoin.SelectedIndex = idx >= 0 ? idx + 1 : 0;
    }

    private async void PopulateDevices()
    {
        CmbCamera.Items.Add("Default");
        CmbMic.Items.Add("Default");
        CmbSpeaker.Items.Add("Default");

        foreach (var d in CaptureService.GetAudioDevices())
            CmbMic.Items.Add(d);

        foreach (var d in AudioPlaybackService.GetOutputDevices())
            CmbSpeaker.Items.Add(d);

        try
        {
            foreach (var d in await CaptureService.GetVideoDevicesAsync())
                CmbCamera.Items.Add(d);
        }
        catch { /* no camera */ }

        var s = _settingsService.Current;
        SelectDeviceItem(CmbCamera,  s.SelectedCameraDevice,  s.SelectedCameraDeviceName);
        SelectDeviceItem(CmbMic,     s.SelectedMicDevice,     s.SelectedMicDeviceName);
        SelectDeviceItem(CmbSpeaker, s.SelectedSpeakerDevice, s.SelectedSpeakerDeviceName);
    }

    private static void SelectDeviceItem(ComboBox combo, string savedId, string savedName)
    {
        if (string.IsNullOrWhiteSpace(savedId) && string.IsNullOrWhiteSpace(savedName))
        { combo.SelectedIndex = 0; return; }

        for (int i = 0; i < combo.Items.Count; i++)
            if (combo.Items[i] is DeviceInfo d && d.Id == savedId)
            { combo.SelectedIndex = i; return; }

        if (!string.IsNullOrWhiteSpace(savedName))
        {
            for (int i = 0; i < combo.Items.Count; i++)
                if (combo.Items[i] is DeviceInfo d &&
                    string.Equals(d.Name, savedName, StringComparison.OrdinalIgnoreCase))
                { combo.SelectedIndex = i; return; }

            for (int i = 0; i < combo.Items.Count; i++)
                if (combo.Items[i] is DeviceInfo d && !string.IsNullOrWhiteSpace(d.Name) &&
                    (d.Name.Contains(savedName, StringComparison.OrdinalIgnoreCase) ||
                     savedName.Contains(d.Name, StringComparison.OrdinalIgnoreCase)))
                { combo.SelectedIndex = i; return; }
        }

        combo.SelectedIndex = 0;
    }

    // ── Channel actions ───────────────────────────────────────────────────────

    private void BtnAddChannel_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new AddChannelDialog { Owner = this };
        if (dlg.ShowDialog() != true || string.IsNullOrWhiteSpace(dlg.ChannelName)) return;

        if (_channels.Any(c => c.Name.Equals(dlg.ChannelName, StringComparison.OrdinalIgnoreCase)))
        {
            MessageBox.Show("That channel already exists.", "PreeceMeet",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        _channels.Add(new ChannelConfig
        {
            Name        = dlg.ChannelName,
            DisplayName = string.IsNullOrWhiteSpace(dlg.DisplayName) ? dlg.ChannelName : dlg.DisplayName,
            Emoji       = dlg.Emoji,
        });
        RefreshChannelList();
    }

    private void BtnEditChannel_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is not ChannelConfig cfg) return;

        var dlg = new AddChannelDialog(cfg) { Owner = this };
        if (dlg.ShowDialog() != true) return;

        cfg.DisplayName = string.IsNullOrWhiteSpace(dlg.DisplayName) ? cfg.Name : dlg.DisplayName;
        cfg.Emoji       = dlg.Emoji;
        RefreshChannelList();
    }

    private void BtnDeleteChannel_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is not ChannelConfig cfg) return;

        var result = MessageBox.Show($"Delete #{cfg.DisplayName}?", "PreeceMeet",
            MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result != MessageBoxResult.Yes) return;

        _channels.Remove(cfg);
        RefreshChannelList();
    }

    // ── Save / Cancel ─────────────────────────────────────────────────────────

    private void BtnSave_Click(object sender, RoutedEventArgs e)
    {
        var s = _settingsService.Current;
        s.DisplayName = TxtDisplayName.Text.Trim();
        s.ServerUrl   = TxtServerUrl.Text.Trim();

        // Channels
        s.Channels = _channels;

        // Auto-join — selectedIndex 0 = "(none)", rest are channel names.
        s.AutoJoinChannel = CmbAutoJoin.SelectedIndex > 0
            ? CmbAutoJoin.SelectedItem as string ?? string.Empty
            : string.Empty;
        // Guard: if the auto-join channel no longer exists, clear it.
        if (!s.Channels.Any(c => c.Name.Equals(s.AutoJoinChannel, StringComparison.OrdinalIgnoreCase)))
            s.AutoJoinChannel = string.Empty;

        var cam     = CmbCamera.SelectedItem  as DeviceInfo;
        var mic     = CmbMic.SelectedItem     as DeviceInfo;
        var speaker = CmbSpeaker.SelectedItem as DeviceInfo;

        s.SelectedCameraDevice      = cam?.Id       ?? string.Empty;
        s.SelectedCameraDeviceName  = cam?.Name     ?? string.Empty;
        s.SelectedMicDevice         = mic?.Id       ?? string.Empty;
        s.SelectedMicDeviceName     = mic?.Name     ?? string.Empty;
        s.SelectedSpeakerDevice     = speaker?.Id   ?? string.Empty;
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
