using System.Net.Http;
using System.Net.Http.Json;
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

    /// <summary>POST /api/auth/verify-totp?room={room}&amp;name={name}</summary>
    public async Task<VerifyTotpResponse> VerifyTotpAsync(string tempToken, string code, string? room = null, string? name = null, CancellationToken ct = default)
    {
        var url = "api/auth/verify-totp";
        var qs  = new List<string>();
        if (!string.IsNullOrWhiteSpace(room)) qs.Add($"room={Uri.EscapeDataString(room)}");
        if (!string.IsNullOrWhiteSpace(name)) qs.Add($"name={Uri.EscapeDataString(name)}");
        if (qs.Count > 0) url += "?" + string.Join("&", qs);

        var request = new VerifyTotpRequest { TempToken = tempToken, Code = code };
        var response = await _http.PostAsJsonAsync(url, request, ct);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<VerifyTotpResponse>(cancellationToken: ct);
        return result ?? throw new InvalidOperationException("Empty response from verify-totp endpoint.");
    }
}
