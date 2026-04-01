namespace PreeceMeet.AuthApi.Models;

public class TempTokenEntry
{
    public string Email { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
}
