using System.Collections.Concurrent;
using LiveKit.Proto;
using LiveKit.Rtc;
using NAudio.Wave;

namespace PreeceMeet.Services;

/// <summary>
/// Consumes LiveKit remote audio streams and plays them through a selected
/// output device using NAudio. Without this service, remote participants'
/// audio is never rendered — the LiveKit .NET SDK does not auto-play audio.
/// </summary>
public sealed class AudioPlaybackService : IDisposable
{
    private readonly ConcurrentDictionary<string, ParticipantAudio> _streams = new();
    private int  _deviceNumber = -1; // -1 = system default
    private bool _disposed;

    // ── Output device enumeration ────────────────────────────────────────────

    public static IReadOnlyList<DeviceInfo> GetOutputDevices()
    {
        var list = new List<DeviceInfo>();
        for (int i = 0; i < WaveOut.DeviceCount; i++)
        {
            var caps = WaveOut.GetCapabilities(i);
            list.Add(new DeviceInfo(i.ToString(), caps.ProductName));
        }
        return list;
    }

    /// <summary>
    /// Set the preferred output device number. Pass -1 for system default.
    /// Takes effect for newly attached tracks; existing streams are recreated.
    /// </summary>
    public void SetOutputDevice(int deviceNumber)
    {
        _deviceNumber = deviceNumber;
        // Restart all active streams on the new device.
        foreach (var kvp in _streams)
            kvp.Value.RestartOutput(deviceNumber);
    }

    public void SetOutputDeviceFromId(string? deviceId)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            SetOutputDevice(-1);
            return;
        }
        if (int.TryParse(deviceId, out int idx) && idx >= 0 && idx < WaveOut.DeviceCount)
            SetOutputDevice(idx);
        else
            SetOutputDevice(-1);
    }

    // ── Track management ─────────────────────────────────────────────────────

    /// <summary>Attach a remote audio track and start playing it.</summary>
    public void AttachTrack(RemoteParticipant participant, RemoteAudioTrack track)
    {
        if (_disposed) return;
        var key = participant.Sid;

        // If there's already a stream for this participant, detach first.
        DetachTrack(participant);

        var pa = new ParticipantAudio(track, _deviceNumber);
        _streams[key] = pa;
    }

    /// <summary>Detach and stop playback for a participant.</summary>
    public void DetachTrack(RemoteParticipant participant)
    {
        if (_streams.TryRemove(participant.Sid, out var pa))
            pa.Dispose();
    }

    /// <summary>Stop all playback (e.g. on disconnect).</summary>
    public void DetachAll()
    {
        foreach (var kvp in _streams)
            kvp.Value.Dispose();
        _streams.Clear();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        DetachAll();
    }

    // ── Inner class: manages a single participant's audio stream ─────────────

    private sealed class ParticipantAudio : IDisposable
    {
        private const int SampleRate = 48000;
        private const int Channels   = 1;

        private CancellationTokenSource? _cts;
        private BufferedWaveProvider?     _buffer;
        private WaveOut?                 _waveOut;
        private readonly RemoteAudioTrack _track;
        private bool _disposed;

        public ParticipantAudio(RemoteAudioTrack track, int deviceNumber)
        {
            _track = track;
            StartOutput(deviceNumber);
        }

        private void StartOutput(int deviceNumber)
        {
            _buffer = new BufferedWaveProvider(new WaveFormat(SampleRate, 16, Channels))
            {
                BufferDuration        = TimeSpan.FromSeconds(2),
                DiscardOnBufferOverflow = true,
            };

            _waveOut = new WaveOut
            {
                DeviceNumber       = deviceNumber,
                DesiredLatency     = 150,
            };
            _waveOut.Init(_buffer);
            _waveOut.Play();

            _cts = new CancellationTokenSource();
            _ = ConsumeAsync(_cts.Token);
        }

        private async Task ConsumeAsync(CancellationToken ct)
        {
            try
            {
                var stream = AudioStream.FromTrack(_track, capacity: 0);
                await foreach (var frameEvent in stream.WithCancellation(ct))
                {
                    if (_disposed || _buffer is null) break;
                    var frame = frameEvent.Frame;
                    // AudioFrame.Data contains Int16 samples; convert to bytes.
                    var samples = frame.Data;
                    var bytes = new byte[samples.Length * 2];
                    Buffer.BlockCopy(samples, 0, bytes, 0, bytes.Length);
                    _buffer.AddSamples(bytes, 0, bytes.Length);
                }
            }
            catch (OperationCanceledException) { }
            catch { /* stream ended or track removed */ }
        }

        public void RestartOutput(int deviceNumber)
        {
            StopOutput();
            if (!_disposed) StartOutput(deviceNumber);
        }

        private void StopOutput()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
            try { _waveOut?.Stop(); } catch { }
            _waveOut?.Dispose();
            _waveOut = null;
            _buffer  = null;
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            StopOutput();
        }
    }
}
