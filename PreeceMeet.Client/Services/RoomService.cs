using System.Collections.ObjectModel;
using System.Net.Http;
using System.Net.Http.Json;
using System.Windows;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

/// <summary>
/// Polls /api/rooms every 15 s and exposes an ObservableCollection of ChannelInfo.
/// Also provides GetRoomTokenAsync to exchange a LiveKit token for a room-specific one.
/// </summary>
public class RoomService : IDisposable
{
    private readonly HttpClient              _http;
    private readonly SettingsService         _settings;
    private readonly SessionService          _session;
    private          CancellationTokenSource _cts = new();
    private          bool                    _disposed;

    public ObservableCollection<ChannelInfo> Channels { get; } = new();

    public event Action<ChannelInfo>? ActivityDetected;

    public RoomService(SettingsService settings, SessionService session)
    {
        _settings = settings;
        _session  = session;
        _http     = new HttpClient();
    }

    // ── Polling ───────────────────────────────────────────────────────────────

    public void Start() => _ = PollLoopAsync(_cts.Token);

    private async Task PollLoopAsync(CancellationToken ct)
    {
        // Initial poll immediately, then every 15 s.
        await PollOnceAsync();

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
                await PollOnceAsync();
        }
        catch (OperationCanceledException) { }
    }

    private async Task PollOnceAsync()
    {
        try
        {
            var session = _session.Load();
            if (session is null || string.IsNullOrEmpty(session.LiveKitToken)) return;

            var baseUrl = _settings.Current.ServerUrl.TrimEnd('/');
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/rooms");
            req.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", session.LiveKitToken);

            using var resp = await _http.SendAsync(req);
            if (!resp.IsSuccessStatusCode) return;

            var rooms = await resp.Content.ReadFromJsonAsync<List<RoomInfo>>();
            if (rooms is null) return;

            Application.Current?.Dispatcher.Invoke(() => MergeRooms(rooms));
        }
        catch { /* non-critical background poll */ }
    }

    private void MergeRooms(List<RoomInfo> serverRooms)
    {
        // Build lookup by room name from server.
        var serverMap = serverRooms.ToDictionary(r => r.Name, StringComparer.OrdinalIgnoreCase);

        // Update configured channels.
        foreach (var ch in Channels)
        {
            if (serverMap.TryGetValue(ch.Name, out var info))
            {
                var hadNoOne = ch.ParticipantCount == 0;
                ch.ParticipantCount = info.NumParticipants;
                ch.ParticipantNames = info.ParticipantNames;

                // Activity dot: someone joined while we're not in the channel.
                if (!ch.IsJoined && hadNoOne && info.NumParticipants > 0)
                {
                    ch.HasActivity = true;
                    ActivityDetected?.Invoke(ch);
                }
            }
            else
            {
                ch.ParticipantCount = 0;
                ch.ParticipantNames = new();
            }
        }

        // Ensure all configured channels are in the list.
        var existingNames = new HashSet<string>(Channels.Select(c => c.Name), StringComparer.OrdinalIgnoreCase);
        foreach (var cfg in _settings.Current.Channels)
        {
            if (!existingNames.Contains(cfg.Name))
                Channels.Add(new ChannelInfo { Name = cfg.Name, DisplayName = cfg.DisplayName });
        }
    }

    public void RebuildFromSettings()
    {
        Application.Current?.Dispatcher.Invoke(() =>
        {
            // Remove channels no longer configured.
            var configured = new HashSet<string>(
                _settings.Current.Channels.Select(c => c.Name), StringComparer.OrdinalIgnoreCase);
            for (int i = Channels.Count - 1; i >= 0; i--)
                if (!configured.Contains(Channels[i].Name)) Channels.RemoveAt(i);

            // Add new ones.
            var existing = new HashSet<string>(Channels.Select(c => c.Name), StringComparer.OrdinalIgnoreCase);
            foreach (var cfg in _settings.Current.Channels)
                if (!existing.Contains(cfg.Name))
                    Channels.Add(new ChannelInfo { Name = cfg.Name, DisplayName = cfg.DisplayName });
        });
    }

    // ── Token exchange ────────────────────────────────────────────────────────

    public async Task<RoomTokenResponse?> GetRoomTokenAsync(string room, string? displayName = null)
    {
        var session = _session.Load();
        if (session is null || string.IsNullOrEmpty(session.LiveKitToken)) return null;

        var baseUrl = _settings.Current.ServerUrl.TrimEnd('/');
        var url     = $"{baseUrl}/api/rooms/token?room={Uri.EscapeDataString(room)}";
        if (!string.IsNullOrWhiteSpace(displayName))
            url += $"&name={Uri.EscapeDataString(displayName)}";

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", session.LiveKitToken);

        using var resp = await _http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<RoomTokenResponse>();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _cts.Cancel();
        _cts.Dispose();
        _http.Dispose();
    }
}
