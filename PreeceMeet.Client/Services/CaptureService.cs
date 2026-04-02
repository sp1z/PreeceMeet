using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using AForge.Video;
using AForge.Video.DirectShow;
using LiveKit.Proto;
using LiveKit.Rtc;
using NAudio.Wave;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

/// <summary>
/// Handles camera and microphone capture and produces LiveKit tracks.
/// Camera uses DirectShow via AForge (no WinRT); mic uses NAudio.
/// </summary>
public class CaptureService : IAsyncDisposable
{
    private WaveInEvent?        _waveIn;
    private VideoCaptureDevice? _videoDevice;
    private VideoSource?        _videoSource;
    private volatile bool       _disposed;

    public AudioSource?     AudioSource { get; private set; }
    public LocalAudioTrack? AudioTrack  { get; private set; }
    public LocalVideoTrack? VideoTrack  { get; private set; }

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
    {
        var list = new List<DeviceInfo>();
        try
        {
            var devices = new FilterInfoCollection(FilterCategory.VideoInputDevice);
            foreach (FilterInfo device in devices)
                list.Add(new DeviceInfo(device.MonikerString, device.Name));
        }
        catch { /* no cameras or DirectShow unavailable */ }
        return Task.FromResult<IReadOnlyList<DeviceInfo>>(list);
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    // DirectShow COM objects require an STA thread — run camera init on a
    // dedicated STA thread so it works even when called from async/MTA context.
    public Task StartCameraAsync(string? deviceId = null)
    {
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try
            {
                var devices = new FilterInfoCollection(FilterCategory.VideoInputDevice);
                if (devices.Count == 0)
                {
                    tcs.SetException(new InvalidOperationException("No video capture devices found."));
                    return;
                }

                // Pick requested device or fall back to first
                FilterInfo? info = null;
                if (!string.IsNullOrWhiteSpace(deviceId))
                    foreach (FilterInfo d in devices)
                        if (d.MonikerString == deviceId) { info = d; break; }
                info ??= devices[0];

                _videoDevice = new VideoCaptureDevice(info.MonikerString);

                // Prefer the resolution closest to 640×480
                var cap = _videoDevice.VideoCapabilities
                    .OrderBy(c => Math.Abs(c.FrameSize.Width - 640) + Math.Abs(c.FrameSize.Height - 480))
                    .FirstOrDefault();
                if (cap != null)
                    _videoDevice.VideoResolution = cap;

                int w = cap?.FrameSize.Width  ?? 640;
                int h = cap?.FrameSize.Height ?? 480;

                _videoSource = new VideoSource(w, h);
                VideoTrack   = _videoSource.CreateTrack("camera");

                _videoDevice.NewFrame += OnNewFrame;
                _videoDevice.Start();
                tcs.SetResult(true);
            }
            catch (Exception ex)
            {
                _videoDevice = null;
                _videoSource = null;
                VideoTrack   = null;
                tcs.SetException(ex);
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        return tcs.Task;
    }

    private void OnNewFrame(object sender, NewFrameEventArgs e)
    {
        if (_disposed || _videoSource == null) return;

        Bitmap bmp = e.Frame;
        int w = bmp.Width, h = bmp.Height;

        // Lock as 32bppArgb — GDI+ stores this as BGRA bytes in memory
        BitmapData bd = bmp.LockBits(
            new Rectangle(0, 0, w, h),
            ImageLockMode.ReadOnly,
            PixelFormat.Format32bppArgb);
        try
        {
            int size = Math.Abs(bd.Stride) * h;
            byte[] data = new byte[size];
            Marshal.Copy(bd.Scan0, data, 0, size);
            _videoSource.CaptureFrame(new VideoFrame(w, h, VideoBufferType.Bgra, data));
        }
        finally
        {
            bmp.UnlockBits(bd);
        }
    }

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

        if (_videoDevice != null)
        {
            _videoDevice.NewFrame -= OnNewFrame;
            _videoDevice.SignalToStop();
            _videoDevice.WaitForStop();
        }
        VideoTrack?.Dispose();
        _videoSource?.Dispose();

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
