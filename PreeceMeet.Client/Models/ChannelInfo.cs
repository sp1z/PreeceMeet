using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PreeceMeet.Models;

public class ChannelInfo : INotifyPropertyChanged
{
    private string       _name             = string.Empty;
    private string       _displayName      = string.Empty;
    private string       _emoji            = string.Empty;
    private int          _participantCount;
    private List<string> _participantNames = new();
    private bool         _isJoined;
    private bool         _hasActivity;

    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(); }
    }

    public string DisplayName
    {
        get => _displayName;
        set { _displayName = value; OnPropertyChanged(); }
    }

    public string Emoji
    {
        get => _emoji;
        set { _emoji = value; OnPropertyChanged(); OnPropertyChanged(nameof(ChannelIcon)); }
    }

    /// <summary>The emoji if set, otherwise "#".</summary>
    public string ChannelIcon => string.IsNullOrWhiteSpace(_emoji) ? "#" : _emoji;

    public int ParticipantCount
    {
        get => _participantCount;
        set
        {
            _participantCount = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(ShowCount));
            OnPropertyChanged(nameof(ParticipantSummary));
        }
    }

    public List<string> ParticipantNames
    {
        get => _participantNames;
        set
        {
            _participantNames = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(ShowParticipants));
            OnPropertyChanged(nameof(ParticipantSummary));
        }
    }

    public bool IsJoined
    {
        get => _isJoined;
        set { _isJoined = value; OnPropertyChanged(); }
    }

    /// <summary>True when someone joins this channel while we're not in it — shows activity dot.</summary>
    public bool HasActivity
    {
        get => _hasActivity;
        set { _hasActivity = value; OnPropertyChanged(); }
    }

    public bool ShowCount       => _participantCount > 0;
    public bool ShowParticipants => _participantNames.Count > 0;
    public string ParticipantSummary => string.Join(", ", _participantNames);

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
