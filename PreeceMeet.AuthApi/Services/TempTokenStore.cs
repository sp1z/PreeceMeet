using System.Collections.Concurrent;
using PreeceMeet.AuthApi.Models;

namespace PreeceMeet.AuthApi.Services;

/// <summary>
/// Thread-safe in-memory store for temporary tokens issued after password verification.
/// Each token expires after 5 minutes.
/// </summary>
public class TempTokenStore
{
    private static readonly TimeSpan Expiry = TimeSpan.FromMinutes(5);
    private readonly ConcurrentDictionary<string, TempTokenEntry> _tokens = new();

    public string Issue(string email)
    {
        // Purge expired tokens opportunistically.
        var now = DateTimeOffset.UtcNow;
        foreach (var key in _tokens.Keys)
            if (_tokens.TryGetValue(key, out var e) && e.ExpiresAt < now)
                _tokens.TryRemove(key, out _);

        var token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        _tokens[token] = new TempTokenEntry { Email = email, ExpiresAt = now.Add(Expiry) };
        return token;
    }

    /// <summary>Returns the email for a valid token without removing it, or null if invalid/expired.</summary>
    public string? Peek(string token)
    {
        if (!_tokens.TryGetValue(token, out var entry))
            return null;

        if (entry.ExpiresAt < DateTimeOffset.UtcNow)
            return null;

        return entry.Email;
    }

    /// <summary>Validates and consumes the token. Returns the associated email or null if invalid/expired.</summary>
    public string? Consume(string token)
    {
        if (!_tokens.TryRemove(token, out var entry))
            return null;

        if (entry.ExpiresAt < DateTimeOffset.UtcNow)
            return null;

        return entry.Email;
    }
}
