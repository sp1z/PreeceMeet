using System.Net.NetworkInformation;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace PreeceMeet.Controls;

public partial class StatsTileControl : UserControl
{
    private DispatcherTimer? _timer;
    private LiveKitService?  _liveKit;
    private string?          _serverHost;

    public StatsTileControl() => InitializeComponent();

    public void Initialize(LiveKitService liveKit, string serverUrl)
    {
        _liveKit    = liveKit;
        _serverHost = Uri.TryCreate(serverUrl, UriKind.Absolute, out var uri) ? uri.Host : serverUrl;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _timer.Tick += async (_, _) => await RefreshAsync();
        _timer.Start();
        _ = RefreshAsync();
    }

    public void Stop()
    {
        _timer?.Stop();
        _timer = null;
    }

    private async Task RefreshAsync()
    {
        if (_liveKit is null) return;

        TxtConnState.Text = _liveKit.IsConnected ? "Status: Connected ✓" : "Status: Disconnected";

        if (_liveKit.ConnectedAt.HasValue)
        {
            var dur = DateTime.UtcNow - _liveKit.ConnectedAt.Value;
            TxtConnected.Text = $"Connected: {FormatDuration(dur)}";
        }
        else
        {
            TxtConnected.Text = "Connected: —";
        }

        int count = _liveKit.RemoteParticipants.Count + (_liveKit.LocalParticipant != null ? 1 : 0);
        TxtParticipants.Text = $"Participants: {count}";

        var names = new List<string>();
        if (_liveKit.LocalParticipant != null)
        {
            var me = _liveKit.LocalParticipant.Name ?? _liveKit.LocalParticipant.Identity ?? "You";
            names.Add($"● {me} (you)");
        }
        foreach (var p in _liveKit.RemoteParticipants)
            names.Add($"● {(p.Name ?? p.Identity ?? p.Sid)}");
        ParticipantList.ItemsSource = names;

        long pingMs = await MeasurePingAsync();
        TxtPing.Text = pingMs >= 0 ? $"Server ping: {pingMs} ms" : "Server ping: —";

        TxtUpdated.Text = $"Updated {DateTime.Now:HH:mm:ss}";
    }

    private async Task<long> MeasurePingAsync()
    {
        if (string.IsNullOrEmpty(_serverHost)) return -1;
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(_serverHost, 3000);
            return reply.Status == IPStatus.Success ? reply.RoundtripTime : -1;
        }
        catch { return -1; }
    }

    private static string FormatDuration(TimeSpan ts)
    {
        if (ts.TotalHours >= 1) return $"{(int)ts.TotalHours}h {ts.Minutes}m {ts.Seconds}s";
        if (ts.TotalMinutes >= 1) return $"{ts.Minutes}m {ts.Seconds}s";
        return $"{ts.Seconds}s";
    }
}
