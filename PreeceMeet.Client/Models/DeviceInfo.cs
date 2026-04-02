namespace PreeceMeet.Models;

/// <summary>A named capture device (camera or microphone).</summary>
public record DeviceInfo(string Id, string Name)
{
    public override string ToString() => Name;
}
