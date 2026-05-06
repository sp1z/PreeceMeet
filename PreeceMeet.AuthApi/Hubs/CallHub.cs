using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PreeceMeet.AuthApi.Data;
using PreeceMeet.AuthApi.Services;

namespace PreeceMeet.AuthApi.Hubs;

/// <summary>
/// SignalR hub for presence + 1:1 call signalling. Auth via ?access_token=&lt;sessionToken&gt;.
/// Media still goes peer-to-peer via LiveKit; this hub only handles ring/accept/decline.
/// </summary>
public class CallHub : Hub
{
    private const string EmailKey = "email";

    private readonly PresenceService     _presence;
    private readonly SessionTokenService _session;
    private readonly LiveKitTokenService _livekit;
    private readonly ApnsPushService     _apns;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CallHub>    _log;
    private readonly string              _livekitUrl;

    public CallHub(PresenceService presence, SessionTokenService session,
                   LiveKitTokenService livekit, ApnsPushService apns,
                   IServiceScopeFactory scopeFactory, ILogger<CallHub> log,
                   IConfiguration config)
    {
        _presence     = presence;
        _session      = session;
        _livekit      = livekit;
        _apns         = apns;
        _scopeFactory = scopeFactory;
        _log          = log;
        _livekitUrl   = config["LIVEKIT_URL"]
                     ?? Environment.GetEnvironmentVariable("LIVEKIT_URL")
                     ?? "wss://meet.russellpreece.com";
    }

    public override async Task OnConnectedAsync()
    {
        var token = Context.GetHttpContext()?.Request.Query["access_token"].ToString();
        var email = _session.Validate(token);
        if (email is null) { Context.Abort(); return; }

        Context.Items[EmailKey] = email;
        _presence.Add(email, Context.ConnectionId);
        await BroadcastPresence();
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items[EmailKey] is string email)
        {
            _presence.Remove(email, Context.ConnectionId);
            await BroadcastPresence();
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task<object> Call(string toEmail, string? fromDisplayName = null)
    {
        var from = (string?)Context.Items[EmailKey];
        if (from is null) return new { ok = false, error = "Not authenticated" };
        if (string.Equals(from, toEmail, StringComparison.OrdinalIgnoreCase))
            return new { ok = false, error = "Cannot call yourself" };
        if (!_presence.IsOnline(toEmail))
            return new { ok = false, error = "User offline" };

        var callId   = Guid.NewGuid().ToString("N");
        var roomName = $"direct-{callId}";
        _presence.RegisterCall(callId, from, toEmail, roomName);

        // Pass along the caller's display name so the incoming ring modal can
        // show it instead of an email address. Server does not trust or store
        // this string beyond the current ring.
        var safeDisplayName = string.IsNullOrWhiteSpace(fromDisplayName)
            ? null
            : (fromDisplayName.Length > 80 ? fromDisplayName[..80] : fromDisplayName);

        await Clients.Clients(_presence.GetConnections(toEmail)).SendAsync("IncomingCall", new
        {
            callId,
            from,
            fromDisplayName = safeDisplayName,
            roomName,
            at = DateTimeOffset.UtcNow,
        });

        // Fire-and-forget APNs push so we don't block the SignalR call when
        // the recipient's phone is asleep. Failures are logged inside.
        _ = SendPushAsync(toEmail, from, safeDisplayName, callId, roomName);

        return new { ok = true, callId, roomName };
    }

    private async Task SendPushAsync(string toEmail, string fromEmail, string? fromDisplayName,
                                     string callId, string roomName)
    {
        if (!_apns.IsConfigured) return;
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tokens = await db.DeviceTokens
                .Where(d => d.Email == toEmail.ToLower() && d.Platform == "ios")
                .Select(d => d.Token)
                .ToListAsync();
            if (tokens.Count == 0) return;

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            var sends = tokens.Select(t =>
                _apns.SendIncomingCallAsync(t, fromEmail, fromDisplayName, callId, roomName, cts.Token));
            var results = await Task.WhenAll(sends);

            // 410 Gone = device unregistered → drop from DB.
            for (var i = 0; i < tokens.Count; i++)
            {
                if (results[i] == 410)
                {
                    var stale = await db.DeviceTokens
                        .Where(d => d.Token == tokens[i])
                        .ToListAsync();
                    db.DeviceTokens.RemoveRange(stale);
                    _log.LogInformation("Pruned stale device token (410) for {Email}", toEmail);
                }
            }
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Push send failed for call {CallId} to {To}", callId, toEmail);
        }
    }

    public async Task Accept(string callId)
    {
        var me   = (string?)Context.Items[EmailKey];
        var call = _presence.TakeCall(callId);
        if (me is null || call is null || !string.Equals(call.To, me, StringComparison.OrdinalIgnoreCase))
            return;

        var fromToken = _livekit.GenerateToken(call.From, call.RoomName);
        var toToken   = _livekit.GenerateToken(call.To,   call.RoomName);

        await Clients.Clients(_presence.GetConnections(call.From)).SendAsync("CallAccepted", new
        {
            callId,
            roomName     = call.RoomName,
            livekitToken = fromToken,
            livekitUrl   = _livekitUrl,
            peer         = call.To,
        });

        await Clients.Caller.SendAsync("CallAccepted", new
        {
            callId,
            roomName     = call.RoomName,
            livekitToken = toToken,
            livekitUrl   = _livekitUrl,
            peer         = call.From,
        });
    }

    public async Task Decline(string callId)
    {
        var call = _presence.TakeCall(callId);
        if (call is null) return;
        await Clients.Clients(_presence.GetConnections(call.From))
            .SendAsync("CallDeclined", new { callId });
    }

    public async Task Cancel(string callId)
    {
        var call = _presence.TakeCall(callId);
        if (call is null) return;
        await Clients.Clients(_presence.GetConnections(call.To))
            .SendAsync("CallCancelled", new { callId });
    }

    private Task BroadcastPresence()
    {
        return Clients.All.SendAsync("PresenceChanged", _presence.OnlineUsers());
    }
}
