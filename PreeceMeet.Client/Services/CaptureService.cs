using LiveKit.Proto;
using LiveKit.Rtc;
using NAudio.Wave;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

/// <summary>
/// Handles microphone capture and produces a LiveKit AudioSource/AudioTrack.
/// Camera capture is not yet implemented for the Windows desktop client.
/// </summary>
public class CaptureService : IAsyncDisposable
{
    private WaveInEvent? _waveIn;
    private volatile bool _disposed;

    public AudioSource?    AudioSource { get; private set; }
    public LocalAudioTrack? AudioTrack { get; private set; }

    // ── Device enumeration ────────────────────────────────────────────────────

    public static IReadOnlyList<DeviceInfo> GetAudioDevices()
    {
        var list  = new List<DeviceInfo>();
        int count = WaveIn.DeviceCount;
        for (int i = 0; i < count; i++)
        {
            var caps = WaveIn.GetCapabilities(i);
            list.Add(new DeviceInfo(i.ToString(), caps.ProductName));
        }
        return list;
    }

    public static Task<IReadOnlyList<DeviceInfo>> GetVideoDevicesAsync()
        => Task.FromResult<IReadOnlyList<DeviceInfo>>(Array.Empty<DeviceInfo>());

    // ── Camera (not yet implemented) ──────────────────────────────────────────

    public Task StartCameraAsync(string? deviceId = null)
    {
        // Camera capture requires WinRT (Windows.Media.Capture) — not yet wired up.
        return Task.CompletedTask;
    }

    public LocalVideoTrack? VideoTrack => null;

    // ── Microphone ────────────────────────────────────────────────────────────

    public Task StartMicAsync(string? deviceIndex = null)
    {
        int deviceNumber = 0;
        if (!string.IsNullOrWhiteSpace(deviceIndex) &&
            int.TryParse(deviceIndex, out int idx) &&
            idx >= 0 && idx < WaveIn.DeviceCount)
        {
            deviceNumber = idx;
        }

        const int sampleRate = 48000;
        const int channels   = 1;

        AudioSource = new AudioSource(sampleRate, channels);
        AudioTrack  = AudioSource.CreateTrack("microphone");

        _waveIn = new WaveInEvent
        {
            DeviceNumber       = deviceNumber,
            WaveFormat         = new WaveFormat(sampleRate, 16, channels),
            BufferMilliseconds = 100,
        };
        _waveIn.DataAvailable += OnAudioData;
        _waveIn.StartRecording();
        return Task.CompletedTask;
    }

    private void OnAudioData(object? sender, WaveInEventArgs e)
    {
        if (_disposed || AudioSource == null || e.BytesRecorded == 0) return;

        int samplesPerChannel = e.BytesRecorded / 2;
        var shorts = new short[samplesPerChannel];
        Buffer.BlockCopy(e.Buffer, 0, shorts, 0, e.BytesRecorded);
        _ = AudioSource.CaptureFrameAsync(new AudioFrame(shorts, 48000, 1, samplesPerChannel));
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    public ValueTask DisposeAsync()
    {
        if (_disposed) return ValueTask.CompletedTask;
        _disposed = true;

        if (_waveIn != null)
        {
            _waveIn.DataAvailable -= OnAudioData;
            _waveIn.StopRecording();
            _waveIn.Dispose();
        }

        AudioTrack?.Dispose();
        AudioSource?.Dispose();
        return ValueTask.CompletedTask;
    }
}
