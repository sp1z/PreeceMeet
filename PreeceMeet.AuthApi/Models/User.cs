namespace PreeceMeet.AuthApi.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    /// <summary>BCrypt hash of the user's password.</summary>
    public string PasswordHash { get; set; } = string.Empty;
    /// <summary>Base32-encoded TOTP secret.</summary>
    public string TotpSecret { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
