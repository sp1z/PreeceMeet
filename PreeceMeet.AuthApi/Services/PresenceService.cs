namespace PreeceMeet.AuthApi.Services;

/// <summary>
/// In-memory presence + active call tracking. One process only — fine for our scale.
/// </summary>
public class PresenceService
{
    private readonly object _lock = new();
    private readonly Dictionary<string, HashSet<string>> _byEmail = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, CallInfo> _calls = new();

    public void Add(string email, string connectionId)
    {
        lock (_lock)
        {
            if (!_byEmail.TryGetValue(email, out var set))
            {
                set = new HashSet<string>();
                _byEmail[email] = set;
            }
            set.Add(connectionId);
        }
    }

    public bool Remove(string email, string connectionId)
    {
        lock (_lock)
        {
            if (!_byEmail.TryGetValue(email, out var set)) return false;
            set.Remove(connectionId);
            if (set.Count == 0) { _byEmail.Remove(email); return true; }
            return false;
        }
    }

    public IReadOnlyList<string> GetConnections(string email)
    {
        lock (_lock)
        {
            return _byEmail.TryGetValue(email, out var set) ? set.ToList() : Array.Empty<string>();
        }
    }

    public bool IsOnline(string email)
    {
        lock (_lock) { return _byEmail.ContainsKey(email); }
    }

    public IReadOnlyList<string> OnlineUsers()
    {
        lock (_lock) { return _byEmail.Keys.ToList(); }
    }

    public void RegisterCall(string id, string from, string to, string roomName)
    {
        lock (_lock)
        {
            _calls[id] = new CallInfo(from, to, roomName, DateTimeOffset.UtcNow);
        }
    }

    public CallInfo? TakeCall(string id)
    {
        lock (_lock)
        {
            if (_calls.TryGetValue(id, out var info)) { _calls.Remove(id); return info; }
            return null;
        }
    }

    public CallInfo? PeekCall(string id)
    {
        lock (_lock) { return _calls.TryGetValue(id, out var info) ? info : null; }
    }
}

public record CallInfo(string From, string To, string RoomName, DateTimeOffset CreatedAt);
