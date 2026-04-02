using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

public class AdminService
{
    private readonly string _baseUrl;
    private readonly string _bearerToken;

    public AdminService(string baseUrl, string bearerToken)
    {
        _baseUrl     = baseUrl.TrimEnd('/') + "/";
        _bearerToken = bearerToken;
    }

    private HttpClient Client()
    {
        var http = new HttpClient { BaseAddress = new Uri(_baseUrl) };
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _bearerToken);
        return http;
    }

    public async Task<List<UserInfo>> GetUsersAsync(CancellationToken ct = default)
    {
        using var http = Client();
        var resp = await http.GetAsync("api/admin/users", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<UserInfo>>(cancellationToken: ct) ?? new();
    }

    public async Task CreateUserAsync(string email, string password, CancellationToken ct = default)
    {
        using var http = Client();
        var resp = await http.PostAsJsonAsync("api/admin/users", new { email, password }, ct);
        resp.EnsureSuccessStatusCode();
    }

    public async Task DeleteUserAsync(string email, CancellationToken ct = default)
    {
        using var http = Client();
        var resp = await http.DeleteAsync($"api/admin/users/{Uri.EscapeDataString(email)}", ct);
        resp.EnsureSuccessStatusCode();
    }

    public async Task ResetTotpAsync(string email, CancellationToken ct = default)
    {
        using var http = Client();
        var resp = await http.PostAsync($"api/admin/users/{Uri.EscapeDataString(email)}/reset-totp", null, ct);
        resp.EnsureSuccessStatusCode();
    }

    public async Task ChangePasswordAsync(string email, string newPassword, CancellationToken ct = default)
    {
        using var http = Client();
        var resp = await http.PatchAsJsonAsync($"api/admin/users/{Uri.EscapeDataString(email)}/password", new { password = newPassword }, ct);
        resp.EnsureSuccessStatusCode();
    }
}
