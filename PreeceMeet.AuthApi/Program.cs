using System.Security.Cryptography;
using System.Text;
using Livekit.Server.Sdk.Dotnet;
using Microsoft.EntityFrameworkCore;
using OtpNet;
using PreeceMeet.AuthApi.Data;
using PreeceMeet.AuthApi.Hubs;
using PreeceMeet.AuthApi.Models;
using PreeceMeet.AuthApi.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Configuration ─────────────────────────────────────────────────────────────

string Cfg(string key) =>
    builder.Configuration[key] ?? Environment.GetEnvironmentVariable(key) ?? string.Empty;

var adminKey      = Cfg("ADMIN_KEY");
var livekitApiKey = Cfg("LIVEKIT_API_KEY");
var livekitSecret = Cfg("LIVEKIT_SECRET");
var livekitUrl    = Cfg("LIVEKIT_URL").NullIfEmpty()  ?? "wss://meet.russellpreece.com";
var livekitRoom   = Cfg("LIVEKIT_ROOM").NullIfEmpty() ?? "preecemeet";
var dbPath        = Cfg("DB_PATH").NullIfEmpty()      ?? "/data/preecemeet.db";

// ── Services ──────────────────────────────────────────────────────────────────

builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlite($"Data Source={dbPath}"));

builder.Services.AddSingleton<TempTokenStore>();
builder.Services.AddSingleton<PresenceService>();
builder.Services.AddSingleton(new LiveKitTokenService(livekitApiKey, livekitSecret));
builder.Services.AddSingleton(new SessionTokenService(livekitSecret));
builder.Services.AddSignalR();

// SignalR + WebSocket needs SetIsOriginAllowed (not AllowAnyOrigin) when used
// with credentials/cookies; we don't use cookies but Electron's file:// origin
// is happier with this form.
builder.Services.AddCors(opts => opts.AddDefaultPolicy(policy =>
    policy.SetIsOriginAllowed(_ => true)
          .AllowAnyMethod()
          .AllowAnyHeader()
          .AllowCredentials()));

var livekitHttpUrl = livekitUrl.Replace("wss://", "https://").Replace("ws://", "http://");
var roomService    = new RoomServiceClient(livekitHttpUrl, livekitApiKey, livekitSecret);

var app = builder.Build();

app.UseCors();

// ── Ensure DB exists + migrate IsAdmin column ─────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // Add IsAdmin column to existing DBs that pre-date this field.
    try
    {
        db.Database.ExecuteSqlRaw(
            "ALTER TABLE Users ADD COLUMN IsAdmin INTEGER NOT NULL DEFAULT 0");
    }
    catch { /* Column already exists — ignore. */ }

    // Auto-promote existing @russellpreece.com users to admin.
    var domainUsers = await db.Users
        .Where(u => u.Email.EndsWith("@russellpreece.com"))
        .ToListAsync();
    foreach (var u in domainUsers.Where(u => !u.IsAdmin))
    {
        u.IsAdmin = true;
    }
    if (domainUsers.Any(u => !u.IsAdmin == false)) // save if any were updated
        await db.SaveChangesAsync();
}

// ── Admin auth helper ─────────────────────────────────────────────────────────
// Checks DB IsAdmin flag so grant/revoke takes effect immediately.

async Task<string?> RequireAdmin(string? authHeader, SessionTokenService session, AppDbContext db)
{
    var email = session.Validate(authHeader);
    if (email is null) return null;

    // @russellpreece.com domain always has admin access (bootstrap).
    if (email.EndsWith("@russellpreece.com", StringComparison.OrdinalIgnoreCase))
        return email;

    var user = await db.Users.AsNoTracking()
        .FirstOrDefaultAsync(u => u.Email == email);
    return user?.IsAdmin == true ? email : null;
}

// ── Health ────────────────────────────────────────────────────────────────────

app.MapGet("/api/health", () => Results.Ok(new { status = "healthy" }));

// ── Auth: login ───────────────────────────────────────────────────────────────

app.MapPost("/api/auth/login", async (LoginRequest req, AppDbContext db, TempTokenStore tokens) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
        return Results.BadRequest(new { error = "Email and password are required." });

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == req.Email.ToLowerInvariant());
    if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        return Results.Unauthorized();

    var tempToken = tokens.Issue(user.Email);

    if (!user.TotpConfigured)
    {
        var issuer  = Uri.EscapeDataString("PreeceMeet");
        var account = Uri.EscapeDataString(user.Email);
        var otpUri  = $"otpauth://totp/{issuer}:{account}?secret={user.TotpSecret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";
        return Results.Ok(new { requireTotp = true, tempToken, totpSetup = true, totpSecret = user.TotpSecret, otpUri });
    }

    return Results.Ok(new { requireTotp = true, tempToken, totpSetup = false });
});

// ── Auth: verify TOTP ─────────────────────────────────────────────────────────

app.MapPost("/api/auth/verify-totp", async (
    VerifyTotpRequest req,
    string? room,
    string? name,
    AppDbContext db,
    TempTokenStore tokens,
    LiveKitTokenService livekit,
    SessionTokenService session) =>
{
    if (string.IsNullOrWhiteSpace(req.TempToken) || string.IsNullOrWhiteSpace(req.Code))
        return Results.BadRequest(new { error = "tempToken and code are required." });

    var email = tokens.Peek(req.TempToken);
    if (email is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email);
    if (user is null)
        return Results.Unauthorized();

    var secretBytes = Base32Encoding.ToBytes(user.TotpSecret);
    var totp        = new Totp(secretBytes);
    var isValid     = totp.VerifyTotp(req.Code.Trim(), out _, new VerificationWindow(previous: 1, future: 1));

    if (!isValid)
        return Results.Unauthorized();

    tokens.Consume(req.TempToken);

    if (!user.TotpConfigured)
    {
        user.TotpConfigured = true;
        await db.SaveChangesAsync();
    }

    // Determine admin status: domain users always admin; others from DB flag.
    var isAdmin = user.IsAdmin ||
                  email.EndsWith("@russellpreece.com", StringComparison.OrdinalIgnoreCase);

    var livekitToken = livekit.GenerateToken(email, room.NullIfEmpty() ?? livekitRoom, name.NullIfEmpty());
    var sessionToken = session.Generate(email, TimeSpan.FromDays(30), isAdmin);
    return Results.Ok(new { livekitToken, livekitUrl, sessionToken, isAdmin });
});

// ── Auth: me ──────────────────────────────────────────────────────────────────

app.MapGet("/api/auth/me", async (HttpContext ctx, SessionTokenService session, AppDbContext db) =>
{
    var email = session.Validate(ctx.Request.Headers.Authorization);
    if (email is null) return Results.Unauthorized();

    var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email);
    if (user is null) return Results.Unauthorized();

    var isAdmin = user.IsAdmin ||
                  email.EndsWith("@russellpreece.com", StringComparison.OrdinalIgnoreCase);

    return Results.Ok(new { email, isAdmin });
});

// ── Rooms: list ───────────────────────────────────────────────────────────────

app.MapGet("/api/rooms", async (HttpContext ctx, SessionTokenService session) =>
{
    if (session.Validate(ctx.Request.Headers.Authorization) is null)
        return Results.Unauthorized();

    try
    {
        var listResp = await roomService.ListRooms(new ListRoomsRequest());
        var result   = new List<object>();

        foreach (var room in listResp.Rooms)
        {
            var partResp = await roomService.ListParticipants(
                new ListParticipantsRequest { Room = room.Name });

            var participants = partResp.Participants.Select(p =>
            {
                var label = string.IsNullOrWhiteSpace(p.Name) ? p.Identity : p.Name;
                string? avatarEmoji = null;
                // Metadata is a client-controlled JSON blob — never trust its
                // shape; parse defensively and only pick out avatarEmoji.
                if (!string.IsNullOrWhiteSpace(p.Metadata))
                {
                    try
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(p.Metadata);
                        if (doc.RootElement.TryGetProperty("avatarEmoji", out var ae) &&
                            ae.ValueKind == System.Text.Json.JsonValueKind.String)
                        {
                            var s = ae.GetString();
                            // Cap at 32 UTF-16 code units — complex emoji
                        // sequences (e.g. flags, ZWJ) can run 6-14 units.
                        if (!string.IsNullOrEmpty(s) && s.Length <= 32) avatarEmoji = s;
                        }
                    }
                    catch { /* malformed metadata — ignore */ }
                }
                return new { identity = p.Identity, name = label, avatarEmoji };
            }).ToList();

            // Keep the legacy participantNames field for any older clients.
            result.Add(new
            {
                name             = room.Name,
                numParticipants  = room.NumParticipants,
                participantNames = participants.Select(p => p.name).ToList(),
                participants,
            });
        }

        return Results.Ok(result);
    }
    catch
    {
        return Results.Ok(Array.Empty<object>());
    }
});

// ── Rooms: get token ──────────────────────────────────────────────────────────

app.MapGet("/api/rooms/token", (HttpContext ctx, string? room, string? name, LiveKitTokenService livekit, SessionTokenService session) =>
{
    var identity = session.Validate(ctx.Request.Headers.Authorization);
    if (identity is null)
        return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(room))
        return Results.BadRequest(new { error = "room is required." });

    var token = livekit.GenerateToken(identity, room, name.NullIfEmpty());
    return Results.Ok(new { livekitToken = token, livekitUrl });
});

// ── Admin: list users ─────────────────────────────────────────────────────────

app.MapGet("/api/admin/users", async (HttpContext ctx, AppDbContext db, SessionTokenService session) =>
{
    if (await RequireAdmin(ctx.Request.Headers.Authorization, session, db) is null)
        return Results.Unauthorized();

    var users = await db.Users
        .OrderBy(u => u.Email)
        .Select(u => new { u.Email, u.TotpConfigured, u.CreatedAt, u.IsAdmin })
        .ToListAsync();

    return Results.Ok(users);
});

// ── Admin: create user ────────────────────────────────────────────────────────

app.MapPost("/api/admin/users", async (CreateUserRequest req, HttpContext ctx, AppDbContext db, SessionTokenService session) =>
{
    if (await RequireAdmin(ctx.Request.Headers.Authorization, session, db) is null)
        return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
        return Results.BadRequest(new { error = "Email and password are required." });

    var email = req.Email.ToLowerInvariant().Trim();

    if (await db.Users.AnyAsync(u => u.Email == email))
        return Results.Conflict(new { error = "A user with that email already exists." });

    var secretBytes = new byte[20];
    RandomNumberGenerator.Fill(secretBytes);
    var totpSecret = Base32Encoding.ToString(secretBytes);

    var user = new User
    {
        Email        = email,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
        TotpSecret   = totpSecret,
        CreatedAt    = DateTimeOffset.UtcNow,
    };

    db.Users.Add(user);
    await db.SaveChangesAsync();

    var issuer  = Uri.EscapeDataString("PreeceMeet");
    var account = Uri.EscapeDataString(email);
    var otpUri  = $"otpauth://totp/{issuer}:{account}?secret={totpSecret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";

    return Results.Ok(new { email, otpUri });
});

// ── Admin: change password ────────────────────────────────────────────────────

app.MapPatch("/api/admin/users/{email}/password", async (string email, ChangePasswordRequest req, HttpContext ctx, AppDbContext db, SessionTokenService session) =>
{
    if (await RequireAdmin(ctx.Request.Headers.Authorization, session, db) is null)
        return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.Password))
        return Results.BadRequest(new { error = "Password is required." });

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null) return Results.NotFound(new { error = "User not found." });

    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Password updated." });
});

// ── Admin: reset TOTP ─────────────────────────────────────────────────────────

app.MapPost("/api/admin/users/{email}/reset-totp", async (string email, HttpContext ctx, AppDbContext db, SessionTokenService session) =>
{
    if (await RequireAdmin(ctx.Request.Headers.Authorization, session, db) is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null) return Results.NotFound(new { error = "User not found." });

    var secretBytes = new byte[20];
    RandomNumberGenerator.Fill(secretBytes);
    user.TotpSecret     = Base32Encoding.ToString(secretBytes);
    user.TotpConfigured = false;
    await db.SaveChangesAsync();

    return Results.Ok(new { message = "TOTP reset. User will re-enroll on next login." });
});

// ── Admin: set admin flag ─────────────────────────────────────────────────────

app.MapPatch("/api/admin/users/{email}/is-admin", async (string email, SetAdminRequest req, HttpContext ctx, AppDbContext db, SessionTokenService session) =>
{
    if (await RequireAdmin(ctx.Request.Headers.Authorization, session, db) is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null) return Results.NotFound(new { error = "User not found." });

    user.IsAdmin = req.IsAdmin;
    await db.SaveChangesAsync();
    return Results.Ok(new { email = user.Email, isAdmin = user.IsAdmin });
});

// ── Admin: delete user ────────────────────────────────────────────────────────

app.MapDelete("/api/admin/users/{email}", async (string email, HttpContext ctx, AppDbContext db, SessionTokenService session) =>
{
    if (await RequireAdmin(ctx.Request.Headers.Authorization, session, db) is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null) return Results.NotFound(new { error = "User not found." });

    db.Users.Remove(user);
    await db.SaveChangesAsync();
    return Results.Ok(new { deleted = email });
});

// ── Users: list (for direct-call contact list) ────────────────────────────────

app.MapGet("/api/users", async (HttpContext ctx, AppDbContext db,
    SessionTokenService session, PresenceService presence) =>
{
    var me = session.Validate(ctx.Request.Headers.Authorization);
    if (me is null) return Results.Unauthorized();

    var online = new HashSet<string>(presence.OnlineUsers(), StringComparer.OrdinalIgnoreCase);
    var users  = await db.Users
        .Where(u => u.Email != me)
        .OrderBy(u => u.Email)
        .Select(u => u.Email)
        .ToListAsync();

    return Results.Ok(users.Select(email => new { email, online = online.Contains(email) }));
});

// ── Client diagnostic log upload ──────────────────────────────────────────────
// Authenticated clients POST batches of log lines here; we append them to
// /data/logs/{safeEmail}-{yyyy-MM-dd}.log. Intentionally simple: no parsing,
// no indexing, just durable capture so a dev can tail the file and see what
// a user hit in the wild. Admins can pull via GET /api/admin/logs.
var logsDir = Cfg("LOGS_DIR").NullIfEmpty() ?? "/data/logs";
try { Directory.CreateDirectory(logsDir); } catch { /* best-effort */ }

const int MaxBytesPerUpload = 512 * 1024; // 512 KB per request
const int MaxLinesPerUpload = 2000;

app.MapPost("/api/logs/upload", async (UploadLogRequest req, HttpContext ctx, SessionTokenService session) =>
{
    var email = session.Validate(ctx.Request.Headers.Authorization);
    if (email is null) return Results.Unauthorized();

    if (req.Lines is null || req.Lines.Count == 0)
        return Results.Ok(new { accepted = 0 });

    var lines = req.Lines.Take(MaxLinesPerUpload).ToList();

    // Safe filename derived from email (alphanumeric + @._- → _).
    var safe = new string(email.Select(c =>
        char.IsLetterOrDigit(c) || c == '@' || c == '.' || c == '_' || c == '-' ? c : '_').ToArray());
    var file = Path.Combine(logsDir, $"{safe}-{DateTime.UtcNow:yyyy-MM-dd}.log");

    // Header per batch so we can see session boundaries in the file.
    var header = $"── {DateTime.UtcNow:O} v={req.ClientVersion ?? "?"} " +
                 $"platform={req.Platform ?? "?"} lines={lines.Count} ──";

    var content = new StringBuilder(header.Length + lines.Sum(l => l.Length) + lines.Count * 2 + 4);
    content.AppendLine(header);
    var bytesWritten = 0;
    foreach (var raw in lines)
    {
        var line = raw.Length > 4096 ? raw[..4096] : raw;
        bytesWritten += line.Length + 1;
        if (bytesWritten > MaxBytesPerUpload) break;
        content.AppendLine(line);
    }

    try
    {
        await File.AppendAllTextAsync(file, content.ToString());
        return Results.Ok(new { accepted = lines.Count, file = Path.GetFileName(file) });
    }
    catch (Exception ex)
    {
        return Results.Problem($"log write failed: {ex.Message}");
    }
});

// Admin-only: list log files and read them. No pagination — files are
// date-bucketed so they stay manageable; callers just GET the one they want.
app.MapGet("/api/admin/logs", async (HttpContext ctx, SessionTokenService session, AppDbContext db) =>
{
    var admin = await RequireAdmin(ctx.Request.Headers.Authorization, session, db);
    if (admin is null) return Results.Unauthorized();

    try
    {
        var entries = new DirectoryInfo(logsDir).GetFiles("*.log")
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .Take(500)
            .Select(f => new { name = f.Name, size = f.Length, modified = f.LastWriteTimeUtc })
            .ToList();
        return Results.Ok(entries);
    }
    catch { return Results.Ok(Array.Empty<object>()); }
});

app.MapGet("/api/admin/logs/{name}", async (string name, HttpContext ctx, SessionTokenService session, AppDbContext db) =>
{
    var admin = await RequireAdmin(ctx.Request.Headers.Authorization, session, db);
    if (admin is null) return Results.Unauthorized();

    // Prevent path traversal.
    if (name.Contains('/') || name.Contains('\\') || name.Contains("..")) return Results.BadRequest();
    var path = Path.Combine(logsDir, name);
    if (!File.Exists(path)) return Results.NotFound();
    return Results.File(path, "text/plain; charset=utf-8");
});

// ── SignalR hub for 1:1 call signalling ───────────────────────────────────────

app.MapHub<CallHub>("/hubs/call");

app.Run();

// ── Request DTOs ──────────────────────────────────────────────────────────────

record LoginRequest(string Email, string Password);
record VerifyTotpRequest(string TempToken, string Code);
record CreateUserRequest(string Email, string Password);
record ChangePasswordRequest(string Password);
record SetAdminRequest(bool IsAdmin);
record UploadLogRequest(List<string>? Lines, string? ClientVersion, string? Platform);

// ── String helper ─────────────────────────────────────────────────────────────

static class StringExtensions
{
    public static string? NullIfEmpty(this string s) =>
        string.IsNullOrWhiteSpace(s) ? null : s;
}
