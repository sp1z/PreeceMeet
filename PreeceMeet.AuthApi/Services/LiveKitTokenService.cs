using Livekit.Server.Sdk.Dotnet;

namespace PreeceMeet.AuthApi.Services;

/// <summary>
/// Generates LiveKit access tokens using the official Livekit.Server.Sdk.Dotnet package.
/// </summary>
public class LiveKitTokenService
{
    private readonly string _apiKey;
    private readonly string _apiSecret;

    public LiveKitTokenService(string apiKey, string apiSecret)
    {
        _apiKey    = apiKey;
        _apiSecret = apiSecret;
    }

    /// <summary>
    /// Issues a LiveKit room join token for the given identity.
    /// If roomName is null or empty the grant covers any room.
    /// Token is valid for 6 hours.
    /// </summary>
    public string GenerateToken(string identity, string? roomName = null, string? name = null,
        TimeSpan? ttl = null)
    {
        var grant = new VideoGrants
        {
            RoomJoin              = true,
            CanPublish            = true,
            CanSubscribe          = true,
            // Required for the client to call localParticipant.setMetadata()
            // — we use that channel to broadcast each user's avatar emoji.
            CanUpdateOwnMetadata  = true,
        };

        if (!string.IsNullOrWhiteSpace(roomName))
            grant.Room = roomName;

        var token = new AccessToken(_apiKey, _apiSecret)
            .WithIdentity(identity)
            .WithTtl(ttl ?? TimeSpan.FromHours(6))
            .WithGrants(grant);

        if (!string.IsNullOrWhiteSpace(name))
            token = token.WithName(name);

        return token.ToJwt();
    }
}
