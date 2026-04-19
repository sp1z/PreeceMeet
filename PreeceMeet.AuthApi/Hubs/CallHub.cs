using Microsoft.AspNetCore.SignalR;
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
    private readonly string              _livekitUrl;

    public CallHub(PresenceService presence, SessionTokenService session,
                   LiveKitTokenService livekit, IConfiguration config)
    {
        _presence   = presence;
        _session    = session;
        _livekit    = livekit;
        _livekitUrl = config["LIVEKIT_URL"]
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

    public async Task<object> Call(string toEmail)
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

        await Clients.Clients(_presence.GetConnections(toEmail)).SendAsync("IncomingCall", new
        {
            callId,
            from,
            roomName,
            at = DateTimeOffset.UtcNow,
        });

        return new { ok = true, callId, roomName };
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
