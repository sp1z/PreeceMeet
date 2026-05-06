using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PreeceMeet.AuthApi.Services;

/// <summary>
/// Sends APNs alert pushes via the HTTP/2 token-based provider API
/// (https://developer.apple.com/documentation/usernotifications/sending_notification_requests_to_apns).
/// Configured via env vars; if APNS_KEY_ID is missing the service is a no-op
/// and SendAsync logs a warning the first time.
/// </summary>
public class ApnsPushService
{
    public bool IsConfigured { get; }

    private readonly string _keyId    = "";
    private readonly string _teamId   = "";
    private readonly string _bundleId = "";
    private readonly bool   _sandbox;
    private readonly ECDsa? _key;
    private readonly ILogger<ApnsPushService> _log;

    private static readonly HttpClient _http = new(new SocketsHttpHandler
    {
        EnableMultipleHttp2Connections = true,
        PooledConnectionLifetime       = TimeSpan.FromMinutes(30),
    })
    {
        DefaultRequestVersion       = HttpVersion.Version20,
        DefaultVersionPolicy        = HttpVersionPolicy.RequestVersionExact,
        Timeout                     = TimeSpan.FromSeconds(10),
    };

    private string? _cachedJwt;
    private DateTimeOffset _jwtExpiry = DateTimeOffset.MinValue;
    private readonly object _jwtLock = new();
    private bool _warnedNotConfigured;

    public ApnsPushService(IConfiguration cfg, ILogger<ApnsPushService> log)
    {
        _log = log;

        string Get(string k) => cfg[k] ?? Environment.GetEnvironmentVariable(k) ?? "";
        _keyId    = Get("APNS_KEY_ID");
        _teamId   = Get("APNS_TEAM_ID");
        _bundleId = Get("APNS_BUNDLE_ID");
        _sandbox  = string.Equals(Get("APNS_USE_SANDBOX"), "true", StringComparison.OrdinalIgnoreCase);
        var keyPath = Get("APNS_KEY_PATH");

        if (string.IsNullOrWhiteSpace(_keyId) ||
            string.IsNullOrWhiteSpace(_teamId) ||
            string.IsNullOrWhiteSpace(_bundleId) ||
            string.IsNullOrWhiteSpace(keyPath) ||
            !File.Exists(keyPath))
        {
            IsConfigured = false;
            return;
        }

        try
        {
            _key = ECDsa.Create();
            _key.ImportFromPem(File.ReadAllText(keyPath));
            IsConfigured = true;
            _log.LogInformation("APNs configured: keyId={KeyId} team={Team} bundle={Bundle} sandbox={Sandbox}",
                _keyId, _teamId, _bundleId, _sandbox);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "APNs key load failed from {Path}", keyPath);
            IsConfigured = false;
        }
    }

    /// <summary>Send an INCOMING_CALL alert push. Returns the APNs status code (200 = delivered to APNs).</summary>
    public async Task<int> SendIncomingCallAsync(
        string deviceToken,
        string fromEmail, string? fromDisplayName,
        string callId, string roomName,
        CancellationToken ct = default)
    {
        if (!IsConfigured || _key is null)
        {
            if (!_warnedNotConfigured)
            {
                _warnedNotConfigured = true;
                _log.LogWarning("APNs not configured; ignoring push to {Token}", Truncate(deviceToken));
            }
            return 0;
        }

        var alertBody = string.IsNullOrWhiteSpace(fromDisplayName)
            ? $"{fromEmail} is calling"
            : $"{fromDisplayName} is calling";

        var payload = new
        {
            aps = new
            {
                alert    = new { title = "Incoming call", body = alertBody },
                sound    = "default",
                category = "INCOMING_CALL",
                // Best-effort interrupt level for iOS 15+ — users can opt
                // these into bypassing focus modes.
                interruptionLevel = "time-sensitive",
            },
            callId,
            from = fromEmail,
            fromDisplayName,
            roomName,
        };

        return await SendRawAsync(deviceToken, payload, "alert", "10", $"call-{callId}", ct);
    }

    private async Task<int> SendRawAsync(
        string deviceToken, object payload,
        string pushType, string priority, string? collapseId,
        CancellationToken ct)
    {
        var host = _sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
        var url  = $"https://{host}/3/device/{deviceToken}";

        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Version       = HttpVersion.Version20,
            VersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Content       = JsonContent.Create(payload),
        };
        req.Headers.TryAddWithoutValidation("authorization",  $"bearer {GetJwt()}");
        req.Headers.TryAddWithoutValidation("apns-topic",     _bundleId);
        req.Headers.TryAddWithoutValidation("apns-push-type", pushType);
        req.Headers.TryAddWithoutValidation("apns-priority",  priority);
        if (collapseId is not null)
            req.Headers.TryAddWithoutValidation("apns-collapse-id", collapseId);

        try
        {
            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _log.LogWarning("APNs send failed {Status} for {Token}: {Body}",
                    (int)resp.StatusCode, Truncate(deviceToken), body);
            }
            return (int)resp.StatusCode;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "APNs send threw for {Token}", Truncate(deviceToken));
            return 0;
        }
    }

    private string GetJwt()
    {
        lock (_jwtLock)
        {
            if (_cachedJwt is not null && DateTimeOffset.UtcNow < _jwtExpiry)
                return _cachedJwt;

            var header  = JsonSerializer.SerializeToUtf8Bytes(new { alg = "ES256", kid = _keyId });
            var payload = JsonSerializer.SerializeToUtf8Bytes(new
            {
                iss = _teamId,
                iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            });
            var headerB64    = Base64Url(header);
            var payloadB64   = Base64Url(payload);
            var signingInput = $"{headerB64}.{payloadB64}";
            var sig          = _key!.SignData(Encoding.UTF8.GetBytes(signingInput),
                                              HashAlgorithmName.SHA256,
                                              DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
            _cachedJwt  = $"{signingInput}.{Base64Url(sig)}";
            _jwtExpiry  = DateTimeOffset.UtcNow.AddMinutes(50);
            return _cachedJwt;
        }
    }

    private static string Base64Url(byte[] b) =>
        Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string Truncate(string s) =>
        s.Length <= 12 ? s : s[..6] + "…" + s[^6..];
}
