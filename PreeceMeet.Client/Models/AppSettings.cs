using System.Text.Json.Serialization;

namespace PreeceMeet.Models;

public class AppSettings
{
    [JsonPropertyName("lastRoomName")]
    public string LastRoomName { get; set; } = string.Empty;

    [JsonPropertyName("serverUrl")]
    public string ServerUrl { get; set; } = "https://meet.russellpreece.com";

    [JsonPropertyName("savedEmail")]
    public string SavedEmail { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("rememberMe")]
    public bool RememberMe { get; set; } = false;

    [JsonPropertyName("windowWidth")]
    public double WindowWidth { get; set; } = 1200;

    [JsonPropertyName("windowHeight")]
    public double WindowHeight { get; set; } = 750;

    [JsonPropertyName("windowLeft")]
    public double WindowLeft { get; set; } = double.NaN;

    [JsonPropertyName("windowTop")]
    public double WindowTop { get; set; } = double.NaN;

    [JsonPropertyName("selectedCameraDevice")]
    public string SelectedCameraDevice { get; set; } = string.Empty;

    [JsonPropertyName("selectedMicDevice")]
    public string SelectedMicDevice { get; set; } = string.Empty;

    /// <summary>Participant identity → preferred grid position. Persisted per user.</summary>
    [JsonPropertyName("participantOrder")]
    public Dictionary<string, int> ParticipantOrder { get; set; } = new();

    /// <summary>"Grid" (default) or "Strip" (single horizontal row for gaming overlay).</summary>
    [JsonPropertyName("layoutMode")]
    public string LayoutMode { get; set; } = "Grid";

    [JsonPropertyName("sidebarVisible")]
    public bool SidebarVisible { get; set; } = true;

    /// <summary>Configured channels shown in the sidebar.</summary>
    [JsonPropertyName("channels")]
    public List<ChannelConfig> Channels { get; set; } = new()
    {
        new ChannelConfig { Name = "preecemeet", DisplayName = "General" },
    };
}

public class ChannelConfig
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;
}
