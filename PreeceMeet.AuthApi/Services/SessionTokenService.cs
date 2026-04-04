using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PreeceMeet.AuthApi.Services;

/// <summary>
/// Issues and validates simple HS256 JWTs used as long-lived API session tokens.
/// Completely independent of the LiveKit JWT format.
/// </summary>
public class SessionTokenService
{
    private readonly byte[] _key;

    public SessionTokenService(string secret)
    {
        // Derive a 32-byte key from the LiveKit secret so no new config is needed.
        _key = SHA256.HashData(Encoding.UTF8.GetBytes("preecemeet-session:" + secret));
    }

    /// <summary>Issue a session token for the given email, optionally embedding an admin claim.</summary>
    public string Generate(string email, TimeSpan ttl, bool isAdmin = false)
    {
        var header  = B64U("""{"alg":"HS256","typ":"JWT"}""");
        var payload = B64U(JsonSerializer.Serialize(new
        {
            sub = email,
            exp = DateTimeOffset.UtcNow.Add(ttl).ToUnixTimeSeconds(),
            adm = isAdmin,
        }));

        var message = $"{header}.{payload}";
        var sig     = B64U(HMAC(message));
        return $"{message}.{sig}";
    }

    /// <summary>
    /// Validate a session token from an Authorization header.
    /// Returns the email (sub) on success, null on any failure.
    /// </summary>
    public string? Validate(string? authHeader)
    {
        var (email, _) = ValidateFull(authHeader);
        return email;
    }

    /// <summary>
    /// Validate a session token and return both email and admin flag.
    /// Returns (null, false) on any failure.
    /// </summary>
    public (string? Email, bool IsAdmin) ValidateFull(string? authHeader)
    {
        if (string.IsNullOrWhiteSpace(authHeader)) return (null, false);
        var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? authHeader[7..] : authHeader;
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3) return (null, false);

            // Verify signature.
            var expected = B64U(HMAC($"{parts[0]}.{parts[1]}"));
            if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(expected),
                Encoding.ASCII.GetBytes(parts[2])))
                return (null, false);

            // Decode payload.
            var json = Encoding.UTF8.GetString(FromB64U(parts[1]));
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // Check expiry.
            if (root.TryGetProperty("exp", out var exp) &&
                DateTimeOffset.FromUnixTimeSeconds(exp.GetInt64()) < DateTimeOffset.UtcNow)
                return (null, false);

            var email   = root.TryGetProperty("sub", out var sub) ? sub.GetString() : null;
            var isAdmin = root.TryGetProperty("adm", out var adm) && adm.GetBoolean();
            return (email, isAdmin);
        }
        catch { return (null, false); }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private byte[] HMAC(string message)
    {
        using var hmac = new HMACSHA256(_key);
        return hmac.ComputeHash(Encoding.ASCII.GetBytes(message));
    }

    private static string B64U(string s)   => B64U(Encoding.UTF8.GetBytes(s));
    private static string B64U(byte[] b)   => Convert.ToBase64String(b)
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static byte[] FromB64U(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
        return Convert.FromBase64String(s);
    }
}
