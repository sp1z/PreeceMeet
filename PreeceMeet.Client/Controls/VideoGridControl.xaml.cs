using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Windows;
using System.Windows.Controls;
using LiveKit.Rtc;
using PreeceMeet.Services;

namespace PreeceMeet.Controls;

/// <summary>
/// Manages the layout of VideoTileControls inside a UniformGrid.
/// </summary>
public partial class VideoGridControl : UserControl
{
    private readonly List<VideoTileControl>            _tiles = new();
    private ObservableCollection<RemoteParticipant>?   _remoteParticipants;
    private LocalParticipant?                          _localParticipant;
    private LiveKitService?                            _service;

    public VideoGridControl()
    {
        InitializeComponent();
    }

    public void Initialize(
        ObservableCollection<RemoteParticipant> remoteParticipants,
        LocalParticipant? localParticipant,
        LiveKitService service)
    {
        Clear();

        _service            = service;
        _remoteParticipants = remoteParticipants;
        _localParticipant   = localParticipant;

        _remoteParticipants.CollectionChanged += OnRemoteParticipantsChanged;

        // Forward room-level track events to the appropriate tiles.
        _service.TrackSubscribed   += OnTrackSubscribed;
        _service.TrackUnsubscribed += OnTrackUnsubscribed;
        _service.TrackMuted        += OnTrackMuteChanged;
        _service.TrackUnmuted      += OnTrackMuteChanged;

        RebuildGrid();
    }

    public void Clear()
    {
        if (_remoteParticipants is not null)
            _remoteParticipants.CollectionChanged -= OnRemoteParticipantsChanged;

        if (_service is not null)
        {
            _service.TrackSubscribed   -= OnTrackSubscribed;
            _service.TrackUnsubscribed -= OnTrackUnsubscribed;
            _service.TrackMuted        -= OnTrackMuteChanged;
            _service.TrackUnmuted      -= OnTrackMuteChanged;
        }

        foreach (var tile in _tiles)
            tile.Unbind();

        _tiles.Clear();
        PART_Grid.Children.Clear();
        _remoteParticipants = null;
        _service            = null;
        _localParticipant   = null;
    }

    // ── Track events forwarded from LiveKitService ────────────────────────────

    private void OnTrackSubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        if (e.Track is not RemoteVideoTrack vt) return;
        var tile = FindTile(e.Participant.Sid);
        tile?.AttachVideo(vt);
    }

    private void OnTrackUnsubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        if (e.Track is not RemoteVideoTrack) return;
        var tile = FindTile(e.Participant.Sid);
        tile?.DetachVideo();
    }

    private void OnTrackMuteChanged(object? sender, TrackMutedEventArgs e)
    {
        var tile = FindTile(e.Participant.Sid);
        tile?.UpdateMuteIcon();
    }

    // ── Grid management ───────────────────────────────────────────────────────

    private void RebuildGrid()
    {
        foreach (var tile in _tiles) tile.Unbind();
        _tiles.Clear();
        PART_Grid.Children.Clear();

        if (_localParticipant is not null)
            AddTile(_localParticipant);

        if (_remoteParticipants is not null)
            foreach (var p in _remoteParticipants)
                AddTile(p);

        UpdateColumns();
    }

    private void AddTile(Participant participant)
    {
        var tile = new VideoTileControl();
        tile.Bind(participant);
        _tiles.Add(tile);
        PART_Grid.Children.Add(tile);
    }

    private void RemoveTile(RemoteParticipant participant)
    {
        var tile = FindTile(participant.Sid);
        if (tile is null) return;
        tile.Unbind();
        _tiles.Remove(tile);
        PART_Grid.Children.Remove(tile);
        UpdateColumns();
    }

    private VideoTileControl? FindTile(string sid)
        => _tiles.FirstOrDefault(t => t.BoundParticipant?.Sid == sid);

    private void UpdateColumns()
    {
        int count = _tiles.Count;
        PART_Grid.Columns = count switch
        {
            <= 1 => 1,
            <= 4 => 2,
            <= 9 => 3,
            _    => 4,
        };
    }

    private void OnRemoteParticipantsChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (e.Action == NotifyCollectionChangedAction.Add && e.NewItems is not null)
        {
            foreach (RemoteParticipant p in e.NewItems)
            {
                AddTile(p);
                UpdateColumns();
            }
        }
        else if (e.Action == NotifyCollectionChangedAction.Remove && e.OldItems is not null)
        {
            foreach (RemoteParticipant p in e.OldItems)
                RemoveTile(p);
        }
        else
        {
            RebuildGrid();
        }
    }
}
