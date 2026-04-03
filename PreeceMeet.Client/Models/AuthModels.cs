using System.Text.Json.Serialization;

namespace PreeceMeet.Models;

// ── Login ─────────────────────────────────────────────────────────────────────

public class LoginRequest
{
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    [JsonPropertyName("requireTotp")]
    public bool RequireTotp { get; set; }

    [JsonPropertyName("tempToken")]
    public string TempToken { get; set; } = string.Empty;

    /// <summary>True on first login — client should show QR setup flow.</summary>
    [JsonPropertyName("totpSetup")]
    public bool TotpSetup { get; set; }

    [JsonPropertyName("totpSecret")]
    public string TotpSecret { get; set; } = string.Empty;

    [JsonPropertyName("otpUri")]
    public string OtpUri { get; set; } = string.Empty;
}

// ── TOTP ──────────────────────────────────────────────────────────────────────

public class VerifyTotpRequest
{
    [JsonPropertyName("tempToken")]
    public string TempToken { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;
}

public class VerifyTotpResponse
{
    [JsonPropertyName("livekitToken")]
    public string LiveKitToken { get; set; } = string.Empty;

    [JsonPropertyName("livekitUrl")]
    public string LiveKitUrl { get; set; } = string.Empty;

    [JsonPropertyName("sessionToken")]
    public string SessionToken { get; set; } = string.Empty;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

public class RoomInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("numParticipants")]
    public int NumParticipants { get; set; }

    [JsonPropertyName("participantNames")]
    public List<string> ParticipantNames { get; set; } = new();
}

public class RoomTokenResponse
{
    [JsonPropertyName("livekitToken")]
    public string LiveKitToken { get; set; } = string.Empty;

    [JsonPropertyName("livekitUrl")]
    public string LiveKitUrl { get; set; } = string.Empty;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

public class UserInfo
{
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("totpConfigured")]
    public bool TotpConfigured { get; set; }

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; set; }

    public string TotpStatus     => TotpConfigured ? "✓ Set up" : "— Pending";
    public string CreatedDisplay => CreatedAt.ToLocalTime().ToString("dd MMM yyyy HH:mm");
}

// ── Session (persisted after successful auth) ─────────────────────────────────

public class SavedSession
{
    [JsonPropertyName("livekitUrl")]
    public string LiveKitUrl { get; set; } = string.Empty;

    [JsonPropertyName("livekitToken")]
    public string LiveKitToken { get; set; } = string.Empty;

    /// <summary>Dedicated API session token (HS256, 30-day). Replaces using LiveKit JWT as bearer.</summary>
    [JsonPropertyName("sessionToken")]
    public string SessionToken { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("savedAt")]
    public DateTimeOffset SavedAt { get; set; }
}
