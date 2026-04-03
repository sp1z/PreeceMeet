using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Windows;
using System.Windows.Controls;
using LiveKit.Proto;
using LiveKit.Rtc;
using PreeceMeet.Services;

namespace PreeceMeet.Controls;

/// <summary>
/// Manages the layout of VideoTileControls inside a UniformGrid.
/// </summary>
public partial class VideoGridControl : UserControl
{
    private readonly List<VideoTileControl>          _tiles = new();
    private ObservableCollection<RemoteParticipant>? _remoteParticipants;
    private LocalParticipant?                        _localParticipant;
    private LiveKitService?                          _service;
    private SettingsService?                         _settingsService;
    private bool                                     _stripMode;
    private StatsTileControl?                        _statsTile;

    /// <summary>Fired (on the UI thread) whenever the tile count changes. Only fires in strip/game mode.</summary>
    public event Action<int>? TileCountChanged;

    public int TileCount => _tiles.Count + (_statsTile != null ? 1 : 0);

    public void SetStatsVisible(bool show, LiveKitService? svc = null, string serverUrl = "")
    {
        if (show && _statsTile == null && svc != null)
        {
            _statsTile = new StatsTileControl();
            _statsTile.Initialize(svc, serverUrl);
            PART_Grid.Children.Add(_statsTile);
        }
        else if (!show && _statsTile != null)
        {
            _statsTile.Stop();
            PART_Grid.Children.Remove(_statsTile);
            _statsTile = null;
        }
        UpdateColumns();
    }

    public VideoGridControl() => InitializeComponent();

    public void SetStripMode(bool strip)
    {
        _stripMode = strip;
        UpdateColumns();
    }

    public void Initialize(
        ObservableCollection<RemoteParticipant> remoteParticipants,
        LocalParticipant? localParticipant,
        LiveKitService service,
        SettingsService settingsService)
    {
        Clear();

        _service            = service;
        _settingsService    = settingsService;
        _remoteParticipants = remoteParticipants;
        _localParticipant   = localParticipant;

        _remoteParticipants.CollectionChanged += OnRemoteParticipantsChanged;

        _service.TrackSubscribed       += OnTrackSubscribed;
        _service.TrackUnsubscribed     += OnTrackUnsubscribed;
        _service.TrackMuted            += OnTrackMuteChanged;
        _service.TrackUnmuted          += OnTrackMuteChanged;
        _service.ActiveSpeakersChanged += OnActiveSpeakersChanged;

        _stripMode = settingsService.Current.LayoutMode is "Strip" or "GameMode";
        RebuildGrid();
    }

    public void Clear()
    {
        if (_remoteParticipants is not null)
            _remoteParticipants.CollectionChanged -= OnRemoteParticipantsChanged;

        if (_service is not null)
        {
            _service.TrackSubscribed       -= OnTrackSubscribed;
            _service.TrackUnsubscribed     -= OnTrackUnsubscribed;
            _service.TrackMuted            -= OnTrackMuteChanged;
            _service.TrackUnmuted          -= OnTrackMuteChanged;
            _service.ActiveSpeakersChanged -= OnActiveSpeakersChanged;
        }

        foreach (var tile in _tiles)
        {
            tile.SwapRequested        -= OnSwapRequested;
            tile.MuteLocallyRequested -= OnMuteLocallyRequested;
            tile.PinToTopRequested    -= OnPinToTopRequested;
            tile.Unbind();
        }

        _tiles.Clear();
        PART_Grid.Children.Clear();
        if (_statsTile != null)
        {
            _statsTile.Stop();
            _statsTile = null;
        }
        _remoteParticipants = null;
        _service            = null;
        _localParticipant   = null;
        _settingsService    = null;
    }

    // ── Track events forwarded from LiveKitService ────────────────────────────

    private void OnTrackSubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        if (e.Track is not RemoteVideoTrack vt) return;
        FindTile(e.Participant.Sid)?.AttachVideo(vt);
    }

    private void OnTrackUnsubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        if (e.Track is not RemoteVideoTrack) return;
        FindTile(e.Participant.Sid)?.DetachVideo();
    }

    private void OnTrackMuteChanged(object? sender, TrackMutedEventArgs e)
        => FindTile(e.Participant.Sid)?.UpdateMuteIcon();

    private void OnActiveSpeakersChanged(object? sender, ActiveSpeakersChangedEventArgs e)
    {
        var speakerSids = new HashSet<string>(e.Speakers.Select(p => p.Sid));
        foreach (var tile in _tiles)
            tile.SetSpeaking(tile.BoundParticipant is not null
                          && speakerSids.Contains(tile.BoundParticipant.Sid));
    }

    // ── Tile events ───────────────────────────────────────────────────────────

    private void OnSwapRequested(VideoTileControl source, VideoTileControl target)
    {
        int si = _tiles.IndexOf(source);
        int ti = _tiles.IndexOf(target);
        if (si < 0 || ti < 0) return;
        (_tiles[si], _tiles[ti]) = (_tiles[ti], _tiles[si]);
        RebuildGridChildren();
        SaveOrder();
    }

    private void OnMuteLocallyRequested(VideoTileControl tile)
    {
        if (tile.BoundParticipant is not RemoteParticipant remote) return;
        bool nowMuted = tile.IsLocallyMuted;
        foreach (var pub in remote.TrackPublications.Values)
        {
            if (pub is RemoteTrackPublication rtp && rtp.Kind == TrackKind.KindAudio)
                rtp.SetSubscribed(!nowMuted);
        }
    }

    private void OnPinToTopRequested(VideoTileControl tile)
    {
        int idx = _tiles.IndexOf(tile);
        if (idx <= 0) return;
        _tiles.RemoveAt(idx);
        _tiles.Insert(0, tile);
        RebuildGridChildren();
        SaveOrder();
    }

    // ── Grid management ───────────────────────────────────────────────────────

    private void RebuildGrid()
    {
        foreach (var tile in _tiles)
        {
            tile.SwapRequested        -= OnSwapRequested;
            tile.MuteLocallyRequested -= OnMuteLocallyRequested;
            tile.PinToTopRequested    -= OnPinToTopRequested;
            tile.Unbind();
        }
        _tiles.Clear();
        PART_Grid.Children.Clear();

        var order = _settingsService?.Current.ParticipantOrder ?? new();

        var participants = new List<(Participant p, bool isLocal)>();
        if (_localParticipant is not null)
            participants.Add((_localParticipant, true));
        if (_remoteParticipants is not null)
            foreach (var p in _remoteParticipants)
                participants.Add((p, false));

        // Sort by persisted order; local first when no order saved.
        participants.Sort((a, b) =>
        {
            int oa = order.TryGetValue(a.p.Sid, out var ia) ? ia : (a.isLocal ? -1 : int.MaxValue);
            int ob = order.TryGetValue(b.p.Sid, out var ib) ? ib : (b.isLocal ? -1 : int.MaxValue);
            return oa.CompareTo(ob);
        });

        foreach (var (p, isLocal) in participants)
            AddTile(p, isLocal);

        UpdateColumns();
    }

    private void AddTile(Participant participant, bool isLocal = false)
    {
        var tile = new VideoTileControl();
        tile.SwapRequested        += OnSwapRequested;
        tile.MuteLocallyRequested += OnMuteLocallyRequested;
        tile.PinToTopRequested    += OnPinToTopRequested;
        var nameOverride = isLocal ? _settingsService?.Current.DisplayName : null;
        tile.Bind(participant, isLocal, nameOverride);

        // Attach any video track that was already subscribed before the tile was created.
        // This covers participants who were in the room when we joined — their TrackSubscribed
        // events fire during ConnectAsync before the tile exists, so we attach here.
        if (!isLocal && participant is RemoteParticipant rp)
        {
            foreach (var pub in rp.TrackPublications.Values)
            {
                if (pub is RemoteTrackPublication rtp && rtp.IsSubscribed && rtp.Track is RemoteVideoTrack rvt)
                    tile.AttachVideo(rvt);
            }
        }

        _tiles.Add(tile);
        PART_Grid.Children.Add(tile);
    }

    private void RemoveTile(RemoteParticipant participant)
    {
        var tile = FindTile(participant.Sid);
        if (tile is null) return;
        tile.SwapRequested        -= OnSwapRequested;
        tile.MuteLocallyRequested -= OnMuteLocallyRequested;
        tile.PinToTopRequested    -= OnPinToTopRequested;
        tile.Unbind();
        _tiles.Remove(tile);
        PART_Grid.Children.Remove(tile);
        UpdateColumns();
    }

    private void RebuildGridChildren()
    {
        PART_Grid.Children.Clear();
        foreach (var tile in _tiles)
            PART_Grid.Children.Add(tile);
    }

    private VideoTileControl? FindTile(string sid)
        => _tiles.FirstOrDefault(t => t.BoundParticipant?.Sid == sid);

    private void UpdateColumns()
    {
        int total = _tiles.Count + (_statsTile != null ? 1 : 0);
        if (_stripMode)
        {
            PART_Grid.Rows    = 1;
            PART_Grid.Columns = total;
            TileCountChanged?.Invoke(total);
        }
        else
        {
            PART_Grid.Rows = 0;
            PART_Grid.Columns = total switch
            {
                <= 1 => 1,
                <= 4 => 2,
                <= 9 => 3,
                _    => 4,
            };
        }
    }

    private void SaveOrder()
    {
        if (_settingsService is null) return;
        var order = _settingsService.Current.ParticipantOrder;
        order.Clear();
        for (int i = 0; i < _tiles.Count; i++)
        {
            var sid = _tiles[i].BoundParticipant?.Sid;
            if (sid is not null) order[sid] = i;
        }
        _settingsService.Save();
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
