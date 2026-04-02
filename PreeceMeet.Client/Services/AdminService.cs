using System.Net.Http;
using System.Net.Http.Json;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

public class AdminService
{
    private readonly string _baseUrl;

    public AdminService(string baseUrl)
    {
        _baseUrl = baseUrl.TrimEnd('/') + "/";
    }

    private HttpClient Client(string adminKey)
    {
        var http = new HttpClient { BaseAddress = new Uri(_baseUrl) };
        http.DefaultRequestHeaders.Add("Accept", "application/json");
        http.DefaultRequestHeaders.Add("X-Admin-Key", adminKey);
        return http;
    }

    public async Task<List<UserInfo>> GetUsersAsync(string adminKey, CancellationToken ct = default)
    {
        using var http = Client(adminKey);
        var resp = await http.GetAsync("api/admin/users", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<UserInfo>>(cancellationToken: ct) ?? new();
    }

    public async Task CreateUserAsync(string adminKey, string email, string password, CancellationToken ct = default)
    {
        using var http = Client(adminKey);
        var resp = await http.PostAsJsonAsync("api/admin/users", new { email, password }, ct);
        resp.EnsureSuccessStatusCode();
    }

    public async Task DeleteUserAsync(string adminKey, string email, CancellationToken ct = default)
    {
        using var http = Client(adminKey);
        var resp = await http.DeleteAsync($"api/admin/users/{Uri.EscapeDataString(email)}", ct);
        resp.EnsureSuccessStatusCode();
    }

    public async Task ResetTotpAsync(string adminKey, string email, CancellationToken ct = default)
    {
        using var http = Client(adminKey);
        var resp = await http.PostAsync($"api/admin/users/{Uri.EscapeDataString(email)}/reset-totp", null, ct);
        resp.EnsureSuccessStatusCode();
    }

    public async Task ChangePasswordAsync(string adminKey, string email, string newPassword, CancellationToken ct = default)
    {
        using var http = Client(adminKey);
        var resp = await http.PatchAsJsonAsync($"api/admin/users/{Uri.EscapeDataString(email)}/password", new { password = newPassword }, ct);
        resp.EnsureSuccessStatusCode();
    }
}
