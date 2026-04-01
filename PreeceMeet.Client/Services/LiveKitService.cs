using System.Collections.ObjectModel;
using System.Windows;
using LiveKit.Proto;
using LiveKit.Rtc;

namespace PreeceMeet.Services;

/// <summary>
/// Thin wrapper around the LiveKit .NET Room. Exposes observable state
/// consumed by MainWindow and VideoGridControl.
/// </summary>
public class LiveKitService : IDisposable
{
    private Room? _room;
    private bool  _disposed;

    // ── Observable collections (always mutated on the UI thread) ──────────────

    public ObservableCollection<RemoteParticipant> RemoteParticipants { get; } = new();

    public LocalParticipant? LocalParticipant => _room?.LocalParticipant;

    // ── State flags ───────────────────────────────────────────────────────────

    public bool IsConnected  => _room is { ConnectionState: ConnectionState.ConnConnected };
    public bool MicEnabled   { get; private set; } = true;
    public bool CameraEnabled{ get; private set; } = true;

    // ── Events ────────────────────────────────────────────────────────────────

    public event Action<string>? Error;
    public event Action? Disconnected;

    // Forwarded room-level track events so UI controls can react.
    public event EventHandler<TrackSubscribedEventArgs>?  TrackSubscribed;
    public event EventHandler<TrackSubscribedEventArgs>?  TrackUnsubscribed;
    public event EventHandler<TrackMutedEventArgs>?       TrackMuted;
    public event EventHandler<TrackMutedEventArgs>?       TrackUnmuted;

    // ── Connect / Disconnect ──────────────────────────────────────────────────

    public async Task ConnectAsync(string url, string token, CancellationToken ct = default)
    {
        if (_room is not null)
            await DisconnectAsync();

        _room = new Room();

        _room.ParticipantConnected    += OnParticipantConnected;
        _room.ParticipantDisconnected += OnParticipantDisconnected;
        _room.Disconnected            += OnRoomDisconnected;
        _room.TrackSubscribed         += OnTrackSubscribed;
        _room.TrackUnsubscribed       += OnTrackUnsubscribed;
        _room.TrackMuted              += OnTrackMuted;
        _room.TrackUnmuted            += OnTrackUnmuted;

        await _room.ConnectAsync(url, token, new LiveKit.Rtc.RoomOptions
        {
            AutoSubscribe = true,
            Dynacast      = true,
        }, ct);

        // Populate participants that were already in the room.
        foreach (var (_, participant) in _room.RemoteParticipants)
            Dispatch(() => RemoteParticipants.Add(participant));
    }

    public async Task DisconnectAsync()
    {
        if (_room is null) return;
        try { await _room.DisconnectAsync(); } catch { /* ignore */ }
        CleanupRoom();
    }

    // ── Media controls ────────────────────────────────────────────────────────
    // Note: Livekit.Rtc.Dotnet does not have SetMicrophoneEnabledAsync /
    // SetCameraEnabledAsync on LocalParticipant. Tracks are muted via
    // LocalTrack.Mute() / Unmute(). Full device publish/mute is TODO once
    // local capture is wired up.

    public Task SetMicrophoneEnabledAsync(bool enabled)
    {
        MicEnabled = enabled;
        return Task.CompletedTask;
    }

    public Task SetCameraEnabledAsync(bool enabled)
    {
        CameraEnabled = enabled;
        return Task.CompletedTask;
    }

    // ── Room event handlers ───────────────────────────────────────────────────

    private void OnParticipantConnected(object? sender, Participant participant)
    {
        if (participant is RemoteParticipant remote)
            Dispatch(() => RemoteParticipants.Add(remote));
    }

    private void OnParticipantDisconnected(object? sender, Participant participant)
    {
        if (participant is RemoteParticipant remote)
            Dispatch(() => RemoteParticipants.Remove(remote));
    }

    private void OnRoomDisconnected(object? sender, DisconnectReason reason)
    {
        Dispatch(() =>
        {
            RemoteParticipants.Clear();
            Disconnected?.Invoke();
        });
        CleanupRoom();
    }

    private void OnTrackSubscribed(object? sender, TrackSubscribedEventArgs e)
        => Dispatch(() => TrackSubscribed?.Invoke(sender, e));

    private void OnTrackUnsubscribed(object? sender, TrackSubscribedEventArgs e)
        => Dispatch(() => TrackUnsubscribed?.Invoke(sender, e));

    private void OnTrackMuted(object? sender, TrackMutedEventArgs e)
        => Dispatch(() => TrackMuted?.Invoke(sender, e));

    private void OnTrackUnmuted(object? sender, TrackMutedEventArgs e)
        => Dispatch(() => TrackUnmuted?.Invoke(sender, e));

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void CleanupRoom()
    {
        if (_room is null) return;
        _room.ParticipantConnected    -= OnParticipantConnected;
        _room.ParticipantDisconnected -= OnParticipantDisconnected;
        _room.Disconnected            -= OnRoomDisconnected;
        _room.TrackSubscribed         -= OnTrackSubscribed;
        _room.TrackUnsubscribed       -= OnTrackUnsubscribed;
        _room.TrackMuted              -= OnTrackMuted;
        _room.TrackUnmuted            -= OnTrackUnmuted;
        _room.Dispose();
        _room = null;
    }

    private static void Dispatch(Action action)
    {
        if (Application.Current?.Dispatcher?.CheckAccess() == true)
            action();
        else
            Application.Current?.Dispatcher?.Invoke(action);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        CleanupRoom();
    }
}
