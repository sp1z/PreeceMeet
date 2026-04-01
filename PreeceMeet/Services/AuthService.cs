using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

public class AuthService
{
    private readonly HttpClient _http;

    public AuthService(string baseUrl)
    {
        _http = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/") };
        _http.DefaultRequestHeaders.Add("Accept", "application/json");
    }

    /// <summary>POST /api/auth/login</summary>
    public async Task<LoginResponse> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var request = new LoginRequest { Email = email, Password = password };
        var response = await _http.PostAsJsonAsync("api/auth/login", request, ct);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<LoginResponse>(cancellationToken: ct);
        return result ?? throw new InvalidOperationException("Empty response from login endpoint.");
    }

    /// <summary>POST /api/auth/verify-totp</summary>
    public async Task<VerifyTotpResponse> VerifyTotpAsync(string tempToken, string code, CancellationToken ct = default)
    {
        var request = new VerifyTotpRequest { TempToken = tempToken, Code = code };
        var response = await _http.PostAsJsonAsync("api/auth/verify-totp", request, ct);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<VerifyTotpResponse>(cancellationToken: ct);
        return result ?? throw new InvalidOperationException("Empty response from verify-totp endpoint.");
    }

    /// <summary>POST /api/auth/refresh – exchange a saved session token for a fresh LiveKit JWT.</summary>
    public async Task<RefreshTokenResponse> RefreshTokenAsync(string sessionToken, string room, CancellationToken ct = default)
    {
        var request = new RefreshTokenRequest { SessionToken = sessionToken, Room = room };
        var response = await _http.PostAsJsonAsync("api/auth/refresh", request, ct);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<RefreshTokenResponse>(cancellationToken: ct);
        return result ?? throw new InvalidOperationException("Empty response from refresh endpoint.");
    }
}
