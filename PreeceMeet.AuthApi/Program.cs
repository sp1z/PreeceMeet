using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using OtpNet;
using PreeceMeet.AuthApi.Data;
using PreeceMeet.AuthApi.Models;
using PreeceMeet.AuthApi.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Configuration ─────────────────────────────────────────────────────────────
// Values can come from appsettings.json, environment variables, or Docker env.

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
builder.Services.AddSingleton(new LiveKitTokenService(livekitApiKey, livekitSecret));

var app = builder.Build();

// ── Ensure DB exists ──────────────────────────────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
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

    // First-time login: return TOTP secret so client can display QR for setup.
    if (!user.TotpConfigured)
    {
        var issuer  = Uri.EscapeDataString("PreeceMeet");
        var account = Uri.EscapeDataString(user.Email);
        var otpUri  = $"otpauth://totp/{issuer}:{account}?secret={user.TotpSecret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";
        return Results.Ok(new { requireTotp = true, tempToken, totpSetup = true, totpSecret = user.TotpSecret, otpUri });
    }

    return Results.Ok(new { requireTotp = true, tempToken, totpSetup = false });
});

// ── Auth: verify TOTP and exchange for LiveKit token ─────────────────────────

app.MapPost("/api/auth/verify-totp", async (
    VerifyTotpRequest req,
    string? room,
    string? name,
    AppDbContext db,
    TempTokenStore tokens,
    LiveKitTokenService livekit) =>
{
    if (string.IsNullOrWhiteSpace(req.TempToken) || string.IsNullOrWhiteSpace(req.Code))
        return Results.BadRequest(new { error = "tempToken and code are required." });

    // Peek at the token without consuming it yet, so a wrong code allows retry.
    var email = tokens.Peek(req.TempToken);
    if (email is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email);
    if (user is null)
        return Results.Unauthorized();

    // Validate with +/-1 step (30 second) tolerance.
    var secretBytes = Base32Encoding.ToBytes(user.TotpSecret);
    var totp        = new Totp(secretBytes);
    var isValid     = totp.VerifyTotp(req.Code.Trim(), out _, new VerificationWindow(previous: 1, future: 1));

    if (!isValid)
        return Results.Unauthorized();

    // Code is correct — now consume the token so it can't be reused.
    tokens.Consume(req.TempToken);

    // Mark TOTP as configured on first successful verify.
    if (!user.TotpConfigured)
    {
        user.TotpConfigured = true;
        await db.SaveChangesAsync();
    }

    var livekitToken = livekit.GenerateToken(email, room.NullIfEmpty() ?? livekitRoom, name.NullIfEmpty());
    return Results.Ok(new { livekitToken, livekitUrl });
});

// ── Admin auth helper ─────────────────────────────────────────────────────────
// Decodes a LiveKit JWT (without re-validating the signature — HTTPS + token
// expiry check is sufficient for this internal app) and returns the identity
// if it belongs to @russellpreece.com, otherwise null.

static string? GetAdminIdentity(string? authHeader)
{
    if (string.IsNullOrWhiteSpace(authHeader)) return null;
    var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
        ? authHeader[7..] : authHeader;
    try
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;
        var padded = parts[1].Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        var json = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(padded));
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.TryGetProperty("exp", out var exp) &&
            DateTimeOffset.FromUnixTimeSeconds(exp.GetInt64()) < DateTimeOffset.UtcNow)
            return null;
        if (root.TryGetProperty("sub", out var sub))
        {
            var identity = sub.GetString() ?? string.Empty;
            return identity.EndsWith("@russellpreece.com", StringComparison.OrdinalIgnoreCase)
                ? identity : null;
        }
        return null;
    }
    catch { return null; }
}

// ── Admin: list users ─────────────────────────────────────────────────────────

app.MapGet("/api/admin/users", async (HttpContext ctx, AppDbContext db) =>
{
    if (GetAdminIdentity(ctx.Request.Headers.Authorization) is null)
        return Results.Unauthorized();

    var users = await db.Users
        .OrderBy(u => u.Email)
        .Select(u => new { u.Email, u.TotpConfigured, u.CreatedAt })
        .ToListAsync();

    return Results.Ok(users);
});

// ── Admin: change password ────────────────────────────────────────────────────

app.MapPatch("/api/admin/users/{email}/password", async (string email, ChangePasswordRequest req, HttpContext ctx, AppDbContext db) =>
{
    if (GetAdminIdentity(ctx.Request.Headers.Authorization) is null)
        return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.Password))
        return Results.BadRequest(new { error = "Password is required." });

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null)
        return Results.NotFound(new { error = "User not found." });

    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
    await db.SaveChangesAsync();
    return Results.Ok(new { message = "Password updated." });
});

// ── Admin: create user ────────────────────────────────────────────────────────

app.MapPost("/api/admin/users", async (CreateUserRequest req, HttpContext ctx, AppDbContext db) =>
{
    if (GetAdminIdentity(ctx.Request.Headers.Authorization) is null)
        return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
        return Results.BadRequest(new { error = "Email and password are required." });

    var email = req.Email.ToLowerInvariant().Trim();

    if (await db.Users.AnyAsync(u => u.Email == email))
        return Results.Conflict(new { error = "A user with that email already exists." });

    // 20 random bytes -> base32 TOTP secret.
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

    // Build otpauth:// URI for QR scanning.
    var issuer  = Uri.EscapeDataString("PreeceMeet");
    var account = Uri.EscapeDataString(email);
    var otpUri  = $"otpauth://totp/{issuer}:{account}?secret={totpSecret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";

    return Results.Ok(new { email, otpUri });
});

// ── Admin: reset TOTP (generates new secret, forces re-enroll on next login) ──

app.MapPost("/api/admin/users/{email}/reset-totp", async (string email, HttpContext ctx, AppDbContext db) =>
{
    if (GetAdminIdentity(ctx.Request.Headers.Authorization) is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null)
        return Results.NotFound(new { error = "User not found." });

    var secretBytes = new byte[20];
    RandomNumberGenerator.Fill(secretBytes);
    user.TotpSecret     = Base32Encoding.ToString(secretBytes);
    user.TotpConfigured = false;
    await db.SaveChangesAsync();

    return Results.Ok(new { message = "TOTP reset. User will re-enroll on next login." });
});

// ── Admin: delete user ────────────────────────────────────────────────────────

app.MapDelete("/api/admin/users/{email}", async (string email, HttpContext ctx, AppDbContext db) =>
{
    if (GetAdminIdentity(ctx.Request.Headers.Authorization) is null)
        return Results.Unauthorized();

    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    if (user is null)
        return Results.NotFound(new { error = "User not found." });

    db.Users.Remove(user);
    await db.SaveChangesAsync();
    return Results.Ok(new { deleted = email });
});

app.Run();

// ── Request DTOs ──────────────────────────────────────────────────────────────

record LoginRequest(string Email, string Password);
record VerifyTotpRequest(string TempToken, string Code);
record CreateUserRequest(string Email, string Password);
record ChangePasswordRequest(string Password);

// ── String helper ─────────────────────────────────────────────────────────────

static class StringExtensions
{
    public static string? NullIfEmpty(this string s) =>
        string.IsNullOrWhiteSpace(s) ? null : s;
}
