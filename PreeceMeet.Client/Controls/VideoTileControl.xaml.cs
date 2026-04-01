using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LiveKit;

namespace PreeceMeet.Controls;

public partial class VideoTileControl : UserControl
{
    private Participant? _participant;
    private VideoTrack? _videoTrack;
    private WriteableBitmap? _bitmap;

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

        if (participant is RemoteParticipant remote)
        {
            remote.TrackSubscribed += OnTrackSubscribed;
            remote.TrackUnsubscribed += OnTrackUnsubscribed;
            remote.TrackMuted += OnTrackMuted;
            remote.TrackUnmuted += OnTrackUnmuted;

            foreach (var pub in remote.VideoTracks)
                if (pub.Value.Track is VideoTrack vt)
                    AttachVideo(vt);

            UpdateMuteIcon();
        }
        else if (participant is LocalParticipant local)
        {
            foreach (var pub in local.VideoTracks)
                if (pub.Value.Track is VideoTrack vt)
                    AttachVideo(vt);
        }
    }

    public void Unbind()
    {
        if (_participant is RemoteParticipant remote)
        {
            remote.TrackSubscribed -= OnTrackSubscribed;
            remote.TrackUnsubscribed -= OnTrackUnsubscribed;
            remote.TrackMuted -= OnTrackMuted;
            remote.TrackUnmuted -= OnTrackUnmuted;
        }
        DetachVideo();
        _participant = null;
    }

    private void AttachVideo(VideoTrack track)
    {
        DetachVideo();
        _videoTrack = track;
        _videoTrack.FrameReceived += OnVideoFrame;
        PART_AvatarOverlay.Visibility = Visibility.Collapsed;
        PART_VideoImage.Visibility = Visibility.Visible;
    }

    private void DetachVideo()
    {
        if (_videoTrack is not null)
        {
            _videoTrack.FrameReceived -= OnVideoFrame;
            _videoTrack = null;
        }
        PART_VideoImage.Source = null;
        _bitmap = null;
        PART_AvatarOverlay.Visibility = Visibility.Visible;
        PART_VideoImage.Visibility = Visibility.Collapsed;
    }

    private void OnVideoFrame(VideoFrame frame)
        => Dispatcher.Invoke(() => RenderFrame(frame));

    private void RenderFrame(VideoFrame frame)
    {
        int width  = frame.Width;
        int height = frame.Height;

        if (_bitmap is null || _bitmap.PixelWidth != width || _bitmap.PixelHeight != height)
        {
            _bitmap = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgr32, null);
            PART_VideoImage.Source = _bitmap;
        }

        _bitmap.Lock();
        try
        {
            frame.CopyTo(_bitmap.BackBuffer, _bitmap.BackBufferStride, VideoFrameFormat.BGRA32);
            _bitmap.AddDirtyRect(new Int32Rect(0, 0, width, height));
        }
        finally
        {
            _bitmap.Unlock();
        }
    }

    private void OnTrackSubscribed(IRemoteTrack track, RemoteTrackPublication publication, RemoteParticipant _)
    {
        if (track is VideoTrack vt)
            Dispatcher.Invoke(() => AttachVideo(vt));
    }

    private void OnTrackUnsubscribed(IRemoteTrack track, RemoteTrackPublication publication, RemoteParticipant _)
    {
        if (track is VideoTrack)
            Dispatcher.Invoke(DetachVideo);
    }

    private void OnTrackMuted(TrackPublication publication, Participant _)
    {
        if (publication.Kind == TrackKind.Audio)
            Dispatcher.Invoke(UpdateMuteIcon);
    }

    private void OnTrackUnmuted(TrackPublication publication, Participant _)
    {
        if (publication.Kind == TrackKind.Audio)
            Dispatcher.Invoke(UpdateMuteIcon);
    }

    private void UpdateMuteIcon()
    {
        if (_participant is null) return;
        bool audioMuted = false;
        if (_participant is RemoteParticipant remote)
            foreach (var pub in remote.AudioTracks)
                if (pub.Value.IsMuted) { audioMuted = true; break; }

        PART_MutedIcon.Visibility = audioMuted ? Visibility.Visible : Visibility.Collapsed;
    }
}
