using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PreeceMeet.Models;

namespace PreeceMeet.Services;

/// <summary>
/// Persists an encrypted session to %APPDATA%\PreeceMeet\session.dat using DPAPI.
/// The ciphertext is only decryptable by the same Windows user account.
/// </summary>
public class SessionService
{
    private static readonly string AppDataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PreeceMeet");

    private static readonly string SessionFile = Path.Combine(AppDataDir, "session.dat");

    // Optional entropy salt so that only this application can decrypt the blob.
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("PreeceMeet-v1-entropy");

    public SavedSession? Load()
    {
        try
        {
            if (!File.Exists(SessionFile))
                return null;

            var cipher = File.ReadAllBytes(SessionFile);
            var plain = ProtectedData.Unprotect(cipher, Entropy, DataProtectionScope.CurrentUser);
            var json = Encoding.UTF8.GetString(plain);
            return JsonSerializer.Deserialize<SavedSession>(json);
        }
        catch
        {
            return null;
        }
    }

    public void Save(SavedSession session)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            var json = JsonSerializer.Serialize(session);
            var plain = Encoding.UTF8.GetBytes(json);
            var cipher = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(SessionFile, cipher);
        }
        catch
        {
            // Non-fatal.
        }
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(SessionFile))
                File.Delete(SessionFile);
        }
        catch
        {
            // Ignore.
        }
    }
}
