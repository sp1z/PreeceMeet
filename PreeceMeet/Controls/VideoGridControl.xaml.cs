using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.Windows;
using System.Windows.Controls;
using LiveKit;

namespace PreeceMeet.Controls;

/// <summary>
/// Manages the layout of VideoTileControls inside a UniformGrid.
/// Accepts ObservableCollection&lt;RemoteParticipant&gt; and an optional local participant.
/// </summary>
public partial class VideoGridControl : UserControl
{
    private readonly List<VideoTileControl> _tiles = new();
    private ObservableCollection<RemoteParticipant>? _remoteParticipants;
    private LocalParticipant? _localParticipant;

    public VideoGridControl()
    {
        InitializeComponent();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public void Initialize(ObservableCollection<RemoteParticipant> remoteParticipants, LocalParticipant? localParticipant)
    {
        if (_remoteParticipants is not null)
            _remoteParticipants.CollectionChanged -= OnRemoteParticipantsChanged;

        _remoteParticipants = remoteParticipants;
        _localParticipant   = localParticipant;

        _remoteParticipants.CollectionChanged += OnRemoteParticipantsChanged;

        RebuildGrid();
    }

    public void Clear()
    {
        if (_remoteParticipants is not null)
            _remoteParticipants.CollectionChanged -= OnRemoteParticipantsChanged;

        foreach (var tile in _tiles)
            tile.Unbind();

        _tiles.Clear();
        PART_Grid.Children.Clear();
    }

    // ── Rebuild ───────────────────────────────────────────────────────────────

    private void RebuildGrid()
    {
        foreach (var tile in _tiles) tile.Unbind();
        _tiles.Clear();
        PART_Grid.Children.Clear();

        // Local participant tile always first.
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
        var tile = _tiles.FirstOrDefault(t => t.Tag is RemoteParticipant rp && rp.Sid == participant.Sid);
        if (tile is null) return;
        tile.Unbind();
        _tiles.Remove(tile);
        PART_Grid.Children.Remove(tile);
        UpdateColumns();
    }

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

    // ── Collection changed ────────────────────────────────────────────────────

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
