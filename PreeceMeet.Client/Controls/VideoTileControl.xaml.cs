using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LiveKit.Proto;
using LiveKit.Rtc;

namespace PreeceMeet.Controls;

public partial class VideoTileControl : UserControl
{
    private Participant?              _participant;
    private WriteableBitmap?          _bitmap;
    private CancellationTokenSource?  _videoStreamCts;

    public Participant? BoundParticipant => _participant;

    public VideoTileControl()
    {
        InitializeComponent();
    }

    public void Bind(Participant participant)
    {
        Unbind();
        _participant = participant;

        PART_NameLabel.Text = string.IsNullOrWhiteSpace(participant.Name) ? participant.Sid : participant.Name;
        var initial = PART_NameLabel.Text.Length > 0 ? PART_NameLabel.Text[0].ToString().ToUpperInvariant() : "?";
        PART_AvatarInitial.Text = initial;

        // Attach any already-subscribed video tracks.
        foreach (var pub in participant.TrackPublications.Values)
        {
            if (pub is RemoteTrackPublication remotePub && remotePub.IsSubscribed && remotePub.Track is RemoteVideoTrack rvt)
            {
                AttachVideo(rvt);
                break;
            }
            if (pub.Track is LocalVideoTrack lvt)
            {
                AttachLocalVideo(lvt);
                break;
            }
        }

        UpdateMuteIcon();
    }

    public void Unbind()
    {
        DetachVideo();
        _participant = null;
    }

    // ── Video attachment (called from VideoGridControl for dynamic track events) ─

    public void AttachVideo(RemoteVideoTrack track)
    {
        DetachVideo();
        _videoStreamCts = new CancellationTokenSource();
        _ = ConsumeVideoStreamAsync(VideoStream.FromTrack(track, format: null, capacity: 0), _videoStreamCts.Token);
        PART_AvatarOverlay.Visibility = Visibility.Collapsed;
        PART_VideoImage.Visibility    = Visibility.Visible;
    }

    public void DetachVideo()
    {
        _videoStreamCts?.Cancel();
        _videoStreamCts?.Dispose();
        _videoStreamCts               = null;
        PART_VideoImage.Source        = null;
        _bitmap                       = null;
        PART_AvatarOverlay.Visibility = Visibility.Visible;
        PART_VideoImage.Visibility    = Visibility.Collapsed;
    }

    public void UpdateMuteIcon()
    {
        if (_participant is null) return;
        bool audioMuted = false;
        foreach (var pub in _participant.TrackPublications.Values)
        {
            if (pub.Kind == TrackKind.KindAudio && pub.IsMuted)
            {
                audioMuted = true;
                break;
            }
        }
        PART_MutedIcon.Visibility = audioMuted ? Visibility.Visible : Visibility.Collapsed;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private void AttachLocalVideo(LocalVideoTrack track)
    {
        DetachVideo();
        _videoStreamCts = new CancellationTokenSource();
        _ = ConsumeVideoStreamAsync(VideoStream.FromTrack(track, format: null, capacity: 0), _videoStreamCts.Token);
        PART_AvatarOverlay.Visibility = Visibility.Collapsed;
        PART_VideoImage.Visibility    = Visibility.Visible;
    }

    private async Task ConsumeVideoStreamAsync(VideoStream stream, CancellationToken ct)
    {
        try
        {
            await foreach (var frameEvent in stream.WithCancellation(ct))
                Dispatcher.Invoke(() => RenderFrame(frameEvent.Frame));
        }
        catch (OperationCanceledException) { }
    }

    private void RenderFrame(VideoFrame frame)
    {
        if (_bitmap is null) return;
        int width  = (int)frame.Width;
        int height = (int)frame.Height;

        if (_bitmap.PixelWidth != width || _bitmap.PixelHeight != height)
        {
            _bitmap = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgra32, null);
            PART_VideoImage.Source = _bitmap;
        }

        _bitmap.WritePixels(new Int32Rect(0, 0, width, height), frame.DataBytes, width * 4, 0);
    }
}
