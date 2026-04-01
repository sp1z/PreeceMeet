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
    private bool _disposed;

    // ── Observable collections (always mutated on the UI thread) ──────────────

    public ObservableCollection<RemoteParticipant> RemoteParticipants { get; } = new();

    public LocalParticipant? LocalParticipant => _room?.LocalParticipant;

    // ── State flags ───────────────────────────────────────────────────────────

    public bool IsConnected => _room is { ConnectionState: ConnectionState.Connected };
    public bool MicEnabled { get; private set; } = true;
    public bool CameraEnabled { get; private set; } = true;

    // ── Events ────────────────────────────────────────────────────────────────

    public event Action<string>? Error;
    public event Action? Disconnected;

    // ── Connect / Disconnect ──────────────────────────────────────────────────

    public async Task ConnectAsync(string url, string token, CancellationToken ct = default)
    {
        if (_room is not null)
            await DisconnectAsync();

        _room = new Room();

        _room.ParticipantConnected    += OnParticipantConnected;
        _room.ParticipantDisconnected += OnParticipantDisconnected;
        _room.Disconnected            += OnRoomDisconnected;

        var roomOptions = new RoomOptions
        {
            AutoSubscribe = true,
            Dynacast      = true,
        };

        await _room.ConnectAsync(url, token, roomOptions);

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

    public async Task SetMicrophoneEnabledAsync(bool enabled)
    {
        if (_room?.LocalParticipant is null) return;
        await _room.LocalParticipant.SetMicrophoneEnabledAsync(enabled);
        MicEnabled = enabled;
    }

    public async Task SetCameraEnabledAsync(bool enabled)
    {
        if (_room?.LocalParticipant is null) return;
        await _room.LocalParticipant.SetCameraEnabledAsync(enabled);
        CameraEnabled = enabled;
    }

    // ── Room event handlers ───────────────────────────────────────────────────

    private void OnParticipantConnected(object? sender, RemoteParticipant participant)
        => Dispatch(() => RemoteParticipants.Add(participant));

    private void OnParticipantDisconnected(object? sender, RemoteParticipant participant)
        => Dispatch(() => RemoteParticipants.Remove(participant));

    private void OnRoomDisconnected(object? sender, DisconnectReason reason)
    {
        Dispatch(() =>
        {
            RemoteParticipants.Clear();
            Disconnected?.Invoke();
        });
        CleanupRoom();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void CleanupRoom()
    {
        if (_room is null) return;
        _room.ParticipantConnected    -= OnParticipantConnected;
        _room.ParticipantDisconnected -= OnParticipantDisconnected;
        _room.Disconnected            -= OnRoomDisconnected;
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
