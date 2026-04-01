using System.IO;
using System.Text.Json;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

public class SettingsService
{
    private static readonly string AppDataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PreeceMeet");

    private static readonly string SettingsFile = Path.Combine(AppDataDir, "settings.json");

    private AppSettings _current = new();

    public AppSettings Current => _current;

    public void Load()
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            if (File.Exists(SettingsFile))
            {
                var json = File.ReadAllText(SettingsFile);
                _current = JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
            }
        }
        catch
        {
            _current = new AppSettings();
        }
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var json = JsonSerializer.Serialize(_current, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFile, json);
        }
        catch
        {
            // Non-fatal – best effort persistence.
        }
    }
}
