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
}

// ── Session (persisted after successful auth) ─────────────────────────────────

public class SavedSession
{
    [JsonPropertyName("livekitUrl")]
    public string LiveKitUrl { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("savedAt")]
    public DateTimeOffset SavedAt { get; set; }
}
