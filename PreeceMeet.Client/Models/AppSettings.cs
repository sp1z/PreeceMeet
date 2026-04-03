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

    /// <summary>Saved camera device name for robust matching when device IDs change.</summary>
    [JsonPropertyName("selectedCameraDeviceName")]
    public string SelectedCameraDeviceName { get; set; } = string.Empty;

    [JsonPropertyName("selectedMicDevice")]
    public string SelectedMicDevice { get; set; } = string.Empty;

    /// <summary>Saved mic device name for robust matching when device IDs change.</summary>
    [JsonPropertyName("selectedMicDeviceName")]
    public string SelectedMicDeviceName { get; set; } = string.Empty;

    [JsonPropertyName("selectedSpeakerDevice")]
    public string SelectedSpeakerDevice { get; set; } = string.Empty;

    /// <summary>Saved speaker device name for robust matching when device IDs change.</summary>
    [JsonPropertyName("selectedSpeakerDeviceName")]
    public string SelectedSpeakerDeviceName { get; set; } = string.Empty;

    /// <summary>Participant identity → preferred grid position. Persisted per user.</summary>
    [JsonPropertyName("participantOrder")]
    public Dictionary<string, int> ParticipantOrder { get; set; } = new();

    /// <summary>"Grid" (default) or "GameMode" (single horizontal row with auto-hide UI).</summary>
    [JsonPropertyName("layoutMode")]
    public string LayoutMode { get; set; } = "Grid";

    /// <summary>Height in pixels of each video tile in Game Mode. Default 200.</summary>
    [JsonPropertyName("gameModeTileHeight")]
    public int GameModeTileHeight { get; set; } = 200;

    [JsonPropertyName("sidebarVisible")]
    public bool SidebarVisible { get; set; } = true;

    /// <summary>Configured channels shown in the sidebar.</summary>
    [JsonPropertyName("channels")]
    public List<ChannelConfig> Channels { get; set; } = new()
    {
        new ChannelConfig { Name = "preecemeet", DisplayName = "General", Emoji = "💬" },
    };

    /// <summary>Room name to auto-join on startup. Empty = don't auto-join.</summary>
    [JsonPropertyName("autoJoinChannel")]
    public string AutoJoinChannel { get; set; } = string.Empty;
}

public class ChannelConfig
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("emoji")]
    public string Emoji { get; set; } = string.Empty;
}
