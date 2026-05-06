namespace PreeceMeet.AuthApi.Models;

public class DeviceToken
{
    public int Id { get; set; }
    /// <summary>Owner email (lowercased).</summary>
    public string Email { get; set; } = string.Empty;
    /// <summary>"ios" or "android".</summary>
    public string Platform { get; set; } = string.Empty;
    /// <summary>Raw native push token: APNs hex on iOS, FCM token on Android.</summary>
    public string Token { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastSeenAt { get; set; } = DateTimeOffset.UtcNow;
}
