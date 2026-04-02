#if ENABLE_CAPTURE
using System.Runtime.InteropServices.WindowsRuntime;
using LiveKit.Proto;
using LiveKit.Rtc;
using NAudio.Wave;
using PreeceMeet.Models;
using Windows.Devices.Enumeration;
using Windows.Graphics.Imaging;
using Windows.Media.Capture;
using Windows.Media.Capture.Frames;
using Windows.Media.Devices;
using Windows.Media.MediaProperties;

namespace PreeceMeet.Services;

/// <summary>
/// Handles camera and microphone capture, producing LiveKit VideoSource/AudioSource
/// instances that can be used to publish local tracks.
/// </summary>
public class CaptureService : IAsyncDisposable
{
    private MediaCapture?      _mediaCapture;
    private MediaFrameReader?  _frameReader;
    private WaveInEvent?       _waveIn;
    private volatile bool      _disposed;

    public VideoSource?    VideoSource { get; private set; }
    public AudioSource?    AudioSource { get; private set; }
    public LocalVideoTrack? VideoTrack { get; private set; }
    public LocalAudioTrack? AudioTrack { get; private set; }

    // ── Device enumeration ────────────────────────────────────────────────────

    public static async Task<IReadOnlyList<DeviceInfo>> GetVideoDevicesAsync()
    {
        var selector = MediaDevice.GetVideoCaptureSelector();
        var devices  = await DeviceInformation.FindAllAsync(selector);
        return devices.Select(d => new DeviceInfo(d.Id, d.Name)).ToList();
    }

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

    // ── Camera ────────────────────────────────────────────────────────────────

    public async Task StartCameraAsync(string? deviceId = null)
    {
        var initSettings = new MediaCaptureInitializationSettings
        {
            StreamingCaptureMode = StreamingCaptureMode.Video,
            MemoryPreference     = MediaCaptureMemoryPreference.Cpu,
        };
        if (!string.IsNullOrWhiteSpace(deviceId))
            initSettings.VideoDeviceId = deviceId;

        _mediaCapture = new MediaCapture();
        await _mediaCapture.InitializeAsync(initSettings);

        var frameSource = _mediaCapture.FrameSources.Values.FirstOrDefault(s =>
            s.Info.MediaStreamType == MediaStreamType.VideoPreview ||
            s.Info.MediaStreamType == MediaStreamType.VideoRecord);

        if (frameSource == null)
            throw new InvalidOperationException("No usable video frame source on this device.");

        // Pick a format close to 640×480.
        var preferred = frameSource.SupportedFormats
            .Where(f => f.VideoFormat.Width >= 320 && f.VideoFormat.Width <= 1920)
            .OrderBy(f => Math.Abs((int)f.VideoFormat.Width - 640))
            .FirstOrDefault();
        if (preferred != null)
            await frameSource.SetFormatAsync(preferred);

        int width  = (int)frameSource.CurrentFormat.VideoFormat.Width;
        int height = (int)frameSource.CurrentFormat.VideoFormat.Height;

        VideoSource = new VideoSource(width, height);
        VideoTrack  = VideoSource.CreateTrack("camera");

        _frameReader = await _mediaCapture.CreateFrameReaderAsync(
            frameSource, MediaEncodingSubtypes.Bgra8);
        _frameReader.FrameArrived += OnFrameArrived;
        await _frameReader.StartAsync();
    }

    private void OnFrameArrived(MediaFrameReader reader, MediaFrameArrivedEventArgs _)
    {
        if (_disposed || VideoSource == null) return;

        using var reference = reader.TryAcquireLatestFrame();
        var softwareBitmap  = reference?.VideoMediaFrame?.SoftwareBitmap;
        if (softwareBitmap == null) return;

        SoftwareBitmap? converted = null;
        try
        {
            if (softwareBitmap.BitmapPixelFormat != BitmapPixelFormat.Bgra8 ||
                softwareBitmap.BitmapAlphaMode   != BitmapAlphaMode.Premultiplied)
            {
                converted      = SoftwareBitmap.Convert(softwareBitmap,
                    BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
                softwareBitmap = converted;
            }

            int w    = softwareBitmap.PixelWidth;
            int h    = softwareBitmap.PixelHeight;
            var data = new byte[w * h * 4];
            softwareBitmap.CopyToBuffer(data.AsBuffer());

            VideoSource.CaptureFrame(new VideoFrame(w, h, VideoBufferType.Bgra, data));
        }
        finally
        {
            converted?.Dispose();
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

        int samplesPerChannel = e.BytesRecorded / 2; // 16-bit = 2 bytes
        var shorts = new short[samplesPerChannel];
        Buffer.BlockCopy(e.Buffer, 0, shorts, 0, e.BytesRecorded);
        _ = AudioSource.CaptureFrameAsync(new AudioFrame(shorts, 48000, 1, samplesPerChannel));
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        if (_frameReader != null)
        {
            _frameReader.FrameArrived -= OnFrameArrived;
            await _frameReader.StopAsync();
            _frameReader.Dispose();
        }
        _mediaCapture?.Dispose();

        if (_waveIn != null)
        {
            _waveIn.DataAvailable -= OnAudioData;
            _waveIn.StopRecording();
            _waveIn.Dispose();
        }

        VideoTrack?.Dispose();
        AudioTrack?.Dispose();
        VideoSource?.Dispose();
        AudioSource?.Dispose();
    }
}
#endif
