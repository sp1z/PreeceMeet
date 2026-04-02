using System.Collections.ObjectModel;
using System.Windows;
using LiveKit.Proto;
using LiveKit.Rtc;
using PreeceMeet.Models;

/// <summary>
/// Thin wrapper around the LiveKit .NET Room. Exposes observable state
/// consumed by MainWindow and VideoGridControl.
/// </summary>
public class LiveKitService : IDisposable
{
    private Room?           _room;
    private CaptureService? _capture;
    private bool            _disposed;

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

    public async Task ConnectAsync(string url, string token, AppSettings settings, CancellationToken ct = default)
    {
        if (_room is not null)
            await DisconnectAsync();

        // Start capture devices before connecting.
        _capture = new CaptureService();

        try { await _capture.StartCameraAsync(settings.SelectedCameraDevice.NullIfEmpty()); }
        catch (Exception ex) { Error?.Invoke($"Camera: {ex.Message}"); }

        try { await _capture.StartMicAsync(settings.SelectedMicDevice.NullIfEmpty()); }
        catch (Exception ex) { Error?.Invoke($"Microphone: {ex.Message}"); }

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

        // Publish local tracks.
        if (_capture.VideoTrack != null)
            await _room.LocalParticipant.PublishTrackAsync(_capture.VideoTrack,
                new TrackPublishOptions { Source = TrackSource.SourceCamera, Simulcast = false });

        if (_capture.AudioTrack != null)
            await _room.LocalParticipant.PublishTrackAsync(_capture.AudioTrack,
                new TrackPublishOptions { Source = TrackSource.SourceMicrophone });

        // Populate participants that were already in the room.
        foreach (var (_, participant) in _room.RemoteParticipants)
            Dispatch(() => RemoteParticipants.Add(participant));
    }

    public async Task DisconnectAsync()
    {
        if (_room is null) return;
        try { await _room.DisconnectAsync(); } catch { /* ignore */ }
        CleanupRoom();
        if (_capture != null)
        {
            await _capture.DisposeAsync();
            _capture = null;
        }
    }

    // ── Media controls ────────────────────────────────────────────────────────
    // Note: Livekit.Rtc.Dotnet does not have SetMicrophoneEnabledAsync /
    // SetCameraEnabledAsync on LocalParticipant. Tracks are muted via
    // LocalTrack.Mute() / Unmute(). Full device publish/mute is TODO once
    // local capture is wired up.

    public Task SetMicrophoneEnabledAsync(bool enabled)
    {
        MicEnabled = enabled;
        if (enabled) _capture?.AudioTrack?.Unmute();
        else         _capture?.AudioTrack?.Mute();
        return Task.CompletedTask;
    }

    public Task SetCameraEnabledAsync(bool enabled)
    {
        CameraEnabled = enabled;
        if (enabled) _capture?.VideoTrack?.Unmute();
        else         _capture?.VideoTrack?.Mute();
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

namespace PreeceMeet.Services
{
    internal static class StringExtensions
    {
        public static string? NullIfEmpty(this string s) =>
            string.IsNullOrWhiteSpace(s) ? null : s;
    }
}
