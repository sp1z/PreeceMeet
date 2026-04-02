using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LiveKit.Proto;
using LiveKit.Rtc;

namespace PreeceMeet.Controls;

public partial class VideoTileControl : UserControl
{
    private Participant?             _participant;
    private WriteableBitmap?         _bitmap;
    private CancellationTokenSource? _videoStreamCts;
    private Point                    _dragStart;
    private bool                     _mutedLocally;
    private bool                     _isLocal;

    public Participant? BoundParticipant => _participant;
    public bool         IsLocallyMuted   => _mutedLocally;

    // Raised by context menu items so VideoGridControl can act on them.
    public event Action<VideoTileControl>? MuteLocallyRequested;
    public event Action<VideoTileControl>? PinToTopRequested;
    // Raised on drop so VideoGridControl can reorder tiles.
    public event Action<VideoTileControl, VideoTileControl>? SwapRequested;

    public VideoTileControl()
    {
        InitializeComponent();
    }

    public void Bind(Participant participant, bool isLocal = false, string? displayNameOverride = null)
    {
        Unbind();
        _participant = participant;
        _isLocal     = isLocal;

        PART_NameLabel.Text = !string.IsNullOrWhiteSpace(displayNameOverride)
            ? displayNameOverride : DisplayName(participant);
        var initial = PART_NameLabel.Text.Length > 0
            ? PART_NameLabel.Text[0].ToString().ToUpperInvariant() : "?";
        PART_AvatarInitial.Text = initial;

        // Hide context menu actions that don't apply to the local participant.
        MenuMuteLocally.Visibility = isLocal ? Visibility.Collapsed : Visibility.Visible;
        MenuSeparator.Visibility   = isLocal ? Visibility.Collapsed : Visibility.Visible;

        // Attach any already-published/subscribed video tracks.
        foreach (var pub in participant.TrackPublications.Values)
        {
            if (pub is RemoteTrackPublication rp && rp.IsSubscribed && rp.Track is RemoteVideoTrack rvt)
            { AttachVideo(rvt); break; }
            if (pub.Track is LocalVideoTrack lvt)
            { AttachLocalVideo(lvt); break; }
        }

        UpdateMuteIcon();
    }

    public void Unbind()
    {
        DetachVideo();
        _participant = null;
    }

    private static string DisplayName(Participant p)
        => !string.IsNullOrWhiteSpace(p.Name) ? p.Name
           : !string.IsNullOrWhiteSpace(p.Identity) ? p.Identity
           : p.Sid;

    // ── Speaking highlight ────────────────────────────────────────────────────

    public void SetSpeaking(bool speaking)
        => PART_SpeakingRing.Visibility = speaking ? Visibility.Visible : Visibility.Collapsed;

    // ── Video attachment ──────────────────────────────────────────────────────

    public void AttachVideo(RemoteVideoTrack track)
    {
        DetachVideo();
        _videoStreamCts = new CancellationTokenSource();
        _ = ConsumeVideoStreamAsync(
            VideoStream.FromTrack(track, format: VideoBufferType.Bgra, capacity: 0),
            _videoStreamCts.Token);
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
        bool audioMuted = _mutedLocally;
        if (!audioMuted)
            foreach (var pub in _participant.TrackPublications.Values)
                if (pub.Kind == TrackKind.KindAudio && pub.IsMuted)
                { audioMuted = true; break; }
        PART_MutedIcon.Visibility = audioMuted ? Visibility.Visible : Visibility.Collapsed;
    }

    // ── Internal video stream ─────────────────────────────────────────────────

    private void AttachLocalVideo(LocalVideoTrack track)
    {
        DetachVideo();
        _videoStreamCts = new CancellationTokenSource();
        _ = ConsumeVideoStreamAsync(
            VideoStream.FromTrack(track, format: VideoBufferType.Bgra, capacity: 0),
            _videoStreamCts.Token);
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
        int w = (int)frame.Width, h = (int)frame.Height;
        if (_bitmap is null || _bitmap.PixelWidth != w || _bitmap.PixelHeight != h)
        {
            _bitmap = new WriteableBitmap(w, h, 96, 96, PixelFormats.Bgra32, null);
            PART_VideoImage.Source = _bitmap;
        }
        _bitmap.WritePixels(new Int32Rect(0, 0, w, h), frame.DataBytes, w * 4, 0);
    }

    // ── Drag to reorder ───────────────────────────────────────────────────────

    private void OnMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        => _dragStart = e.GetPosition(this);

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed) return;
        var pos = e.GetPosition(this);
        if (Math.Abs(pos.X - _dragStart.X) < 6 && Math.Abs(pos.Y - _dragStart.Y) < 6) return;
        DragDrop.DoDragDrop(this, this, DragDropEffects.Move);
    }

    private void OnDragOver(object sender, DragEventArgs e)
    {
        bool valid = e.Data.GetDataPresent(typeof(VideoTileControl))
                  && e.Data.GetData(typeof(VideoTileControl)) != this;
        e.Effects = valid ? DragDropEffects.Move : DragDropEffects.None;
        PART_DropIndicator.Visibility = valid ? Visibility.Visible : Visibility.Collapsed;
        e.Handled = true;
    }

    private void OnDrop(object sender, DragEventArgs e)
    {
        PART_DropIndicator.Visibility = Visibility.Collapsed;
        if (e.Data.GetData(typeof(VideoTileControl)) is VideoTileControl source && source != this)
            SwapRequested?.Invoke(source, this);
        e.Handled = true;
    }

    // ── Context menu ──────────────────────────────────────────────────────────

    private void MenuMuteLocally_Click(object sender, RoutedEventArgs e)
    {
        _mutedLocally = !_mutedLocally;
        MenuMuteLocally.Header = _mutedLocally ? "Unmute for me" : "Mute for me";
        UpdateMuteIcon();
        MuteLocallyRequested?.Invoke(this);
    }

    private void MenuPinToTop_Click(object sender, RoutedEventArgs e)
        => PinToTopRequested?.Invoke(this);
}
