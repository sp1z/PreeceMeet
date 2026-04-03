using System.Collections.ObjectModel;
using System.Windows;
using LiveKit.Proto;
using LiveKit.Rtc;
using PreeceMeet.Models;
using PreeceMeet.Services;

/// <summary>
/// Thin wrapper around the LiveKit .NET Room. Exposes observable state
/// consumed by MainWindow and VideoGridControl.
/// </summary>
public class LiveKitService : IDisposable
{
    private Room?                 _room;
    private bool                  _disposed;
    private CaptureService?       _capture;
    private AudioPlaybackService? _audioPlayback;

    // ── Observable collections (always mutated on the UI thread) ──────────────

    public ObservableCollection<RemoteParticipant> RemoteParticipants { get; } = new();

    public LocalParticipant? LocalParticipant => _room?.LocalParticipant;

    // ── State flags ───────────────────────────────────────────────────────────

    public bool IsConnected  => _room is { ConnectionState: ConnectionState.ConnConnected };
    public bool MicEnabled   { get; private set; } = true;
    public bool CameraEnabled{ get; private set; } = true;
    public DateTime? ConnectedAt { get; private set; }
    public string?   ServerUrl   { get; private set; }

    // ── Events ────────────────────────────────────────────────────────────────

    public event Action<string>? Error;
    public event Action? Disconnected;

    // Forwarded room-level track events so UI controls can react.
    public event EventHandler<TrackSubscribedEventArgs>?        TrackSubscribed;
    public event EventHandler<TrackSubscribedEventArgs>?        TrackUnsubscribed;
    public event EventHandler<TrackMutedEventArgs>?             TrackMuted;
    public event EventHandler<TrackMutedEventArgs>?             TrackUnmuted;
    public event EventHandler<ActiveSpeakersChangedEventArgs>?  ActiveSpeakersChanged;

    // ── Connect / Disconnect ──────────────────────────────────────────────────

    public async Task ConnectAsync(string url, string token, AppSettings settings, CancellationToken ct = default)
    {
        if (_room is not null)
            await DisconnectAsync();

        ServerUrl   = url;
        ConnectedAt = DateTime.UtcNow;

        _audioPlayback = new AudioPlaybackService();
        _audioPlayback.SetOutputDeviceFromId(
            string.IsNullOrWhiteSpace(settings.SelectedSpeakerDevice) ? null : settings.SelectedSpeakerDevice);

        _room = new Room();

        _room.ParticipantConnected    += OnParticipantConnected;
        _room.ParticipantDisconnected += OnParticipantDisconnected;
        _room.Disconnected            += OnRoomDisconnected;
        _room.TrackSubscribed         += OnTrackSubscribed;
        _room.TrackUnsubscribed       += OnTrackUnsubscribed;
        _room.TrackMuted              += OnTrackMuted;
        _room.TrackUnmuted            += OnTrackUnmuted;
        _room.ActiveSpeakersChanged   += OnActiveSpeakersChanged;

        // E2EE — shared key so even the LiveKit server cannot decrypt media.
        var e2eeKey = System.Text.Encoding.UTF8.GetBytes("PreeceMeet-E2EE-2025-SharedKey-v1");
        await _room.ConnectAsync(url, token, new LiveKit.Rtc.RoomOptions
        {
            AutoSubscribe = true,
            Dynacast      = true,
            E2EE = new LiveKit.Rtc.E2EEOptions
            {
                KeyProviderOptions = new LiveKit.Rtc.KeyProviderOptions { SharedKey = e2eeKey },
                EncryptionType     = LiveKit.Proto.EncryptionType.Gcm,
            },
        }, ct);

        // Start capture AFTER the room is connected so that CaptureFrame is never
        // called into a partially-initialised or post-disconnect FFI state.
        var camId = ResolveCamera(settings);
        var micId = ResolveMic(settings);

        _capture = new CaptureService();

        try { await _capture.StartCameraAsync(camId); }
        catch (Exception ex) { Error?.Invoke($"Camera: {ex.Message}"); }

        try { await _capture.StartMicAsync(micId); }
        catch (Exception ex) { Error?.Invoke($"Microphone: {ex.Message}"); }

        // Publish local tracks.
        if (_capture?.VideoTrack != null)
            await _room.LocalParticipant.PublishTrackAsync(_capture.VideoTrack,
                new LiveKit.Rtc.TrackPublishOptions { Source = TrackSource.SourceCamera, Simulcast = false });

        if (_capture?.AudioTrack != null)
            await _room.LocalParticipant.PublishTrackAsync(_capture.AudioTrack,
                new LiveKit.Rtc.TrackPublishOptions { Source = TrackSource.SourceMicrophone });

        // Populate participants that were already in the room.
        foreach (var (_, participant) in _room.RemoteParticipants)
        {
            Dispatch(() => RemoteParticipants.Add(participant));

            // Attach any already-subscribed audio tracks.
            foreach (var pub in participant.TrackPublications.Values)
                if (pub is RemoteTrackPublication rtp && rtp.IsSubscribed && rtp.Track is RemoteAudioTrack rat)
                    _audioPlayback?.AttachTrack(participant, rat);
        }
    }

    public async Task DisconnectAsync()
    {
        if (_room is null) return;

        // Dispose capture first — prevents camera frames from racing into a disposed LiveKit FFI.
        if (_capture != null)
        {
            await _capture.DisposeAsync();
            _capture = null;
        }
        _audioPlayback?.Dispose();
        _audioPlayback = null;

        try { await _room.DisconnectAsync(); } catch { /* ignore */ }
        CleanupRoom();
    }

    // ── Media controls ────────────────────────────────────────────────────────

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
        // Stop frame delivery immediately so CaptureFrame is not called after
        // the room's FFI state is torn down by an unexpected disconnect.
        if (_capture != null)
        {
            var cap = _capture;
            _capture = null;
            Task.Run(async () => await cap.DisposeAsync());
        }

        Dispatch(() =>
        {
            RemoteParticipants.Clear();
            Disconnected?.Invoke();
        });
        CleanupRoom();
    }

    private void OnTrackSubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        // Play remote audio through NAudio — the LiveKit .NET SDK does NOT auto-play audio.
        if (e.Track is RemoteAudioTrack audioTrack && e.Participant is RemoteParticipant remote)
            _audioPlayback?.AttachTrack(remote, audioTrack);

        Dispatch(() => TrackSubscribed?.Invoke(sender, e));
    }

    private void OnTrackUnsubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        if (e.Track is RemoteAudioTrack && e.Participant is RemoteParticipant remote)
            _audioPlayback?.DetachTrack(remote);

        Dispatch(() => TrackUnsubscribed?.Invoke(sender, e));
    }

    private void OnTrackMuted(object? sender, TrackMutedEventArgs e)
        => Dispatch(() => TrackMuted?.Invoke(sender, e));

    private void OnTrackUnmuted(object? sender, TrackMutedEventArgs e)
        => Dispatch(() => TrackUnmuted?.Invoke(sender, e));

    private void OnActiveSpeakersChanged(object? sender, ActiveSpeakersChangedEventArgs e)
        => Dispatch(() => ActiveSpeakersChanged?.Invoke(sender, e));

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void CleanupRoom(bool dispose = false)
    {
        if (_room is null) return;
        _room.ParticipantConnected    -= OnParticipantConnected;
        _room.ParticipantDisconnected -= OnParticipantDisconnected;
        _room.Disconnected            -= OnRoomDisconnected;
        _room.TrackSubscribed         -= OnTrackSubscribed;
        _room.TrackUnsubscribed       -= OnTrackUnsubscribed;
        _room.TrackMuted              -= OnTrackMuted;
        _room.TrackUnmuted            -= OnTrackUnmuted;
        _room.ActiveSpeakersChanged   -= OnActiveSpeakersChanged;
        // Skip Dispose() on room switch — disposing the Room can corrupt the shared
        // LiveKit FFI client, crashing camera frames on the very next connection.
        // Only dispose at full app shutdown where we won't be reconnecting.
        if (dispose) _room.Dispose();
        ConnectedAt = null;
        _room = null;
    }

    private static void Dispatch(Action action)
    {
        if (Application.Current?.Dispatcher?.CheckAccess() == true)
            action();
        else
            Application.Current?.Dispatcher?.Invoke(action);
    }

    // ── Robust device resolution (ID → name fallback) ────────────────────────

    private static string? ResolveCamera(AppSettings s)
    {
        if (string.IsNullOrWhiteSpace(s.SelectedCameraDevice) &&
            string.IsNullOrWhiteSpace(s.SelectedCameraDeviceName))
            return null;

        var devices = CaptureService.GetVideoDevicesAsync().GetAwaiter().GetResult();

        // Try exact ID match.
        if (!string.IsNullOrWhiteSpace(s.SelectedCameraDevice) &&
            devices.Any(d => d.Id == s.SelectedCameraDevice))
            return s.SelectedCameraDevice;

        // Fallback to name match.
        if (!string.IsNullOrWhiteSpace(s.SelectedCameraDeviceName))
        {
            var match = devices.FirstOrDefault(d =>
                string.Equals(d.Name, s.SelectedCameraDeviceName, StringComparison.OrdinalIgnoreCase));
            if (match is not null) return match.Id;

            // Partial name match.
            match = devices.FirstOrDefault(d =>
                d.Name.Contains(s.SelectedCameraDeviceName, StringComparison.OrdinalIgnoreCase) ||
                s.SelectedCameraDeviceName.Contains(d.Name, StringComparison.OrdinalIgnoreCase));
            if (match is not null) return match.Id;
        }

        return null;
    }

    private static string? ResolveMic(AppSettings s)
    {
        if (string.IsNullOrWhiteSpace(s.SelectedMicDevice) &&
            string.IsNullOrWhiteSpace(s.SelectedMicDeviceName))
            return null;

        var devices = CaptureService.GetAudioDevices();

        // Try exact ID match.
        if (!string.IsNullOrWhiteSpace(s.SelectedMicDevice) &&
            devices.Any(d => d.Id == s.SelectedMicDevice))
            return s.SelectedMicDevice;

        // Fallback to name match.
        if (!string.IsNullOrWhiteSpace(s.SelectedMicDeviceName))
        {
            var match = devices.FirstOrDefault(d =>
                string.Equals(d.Name, s.SelectedMicDeviceName, StringComparison.OrdinalIgnoreCase));
            if (match is not null) return match.Id;

            match = devices.FirstOrDefault(d =>
                d.Name.Contains(s.SelectedMicDeviceName, StringComparison.OrdinalIgnoreCase) ||
                s.SelectedMicDeviceName.Contains(d.Name, StringComparison.OrdinalIgnoreCase));
            if (match is not null) return match.Id;
        }

        return null;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        CleanupRoom(dispose: true);
        _audioPlayback?.Dispose();
        _audioPlayback = null;
        if (_capture != null)
        {
            _capture.DisposeAsync().GetAwaiter().GetResult();
            _capture = null;
        }
    }
}
