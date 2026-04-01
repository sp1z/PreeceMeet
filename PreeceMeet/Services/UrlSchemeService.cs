using System.IO;
using System.IO.Pipes;
using System.Threading;

namespace PreeceMeet.Services;

/// <summary>
/// Manages the preecemeet:// custom URL scheme registration and the
/// single-instance named-pipe server/client protocol.
/// </summary>
public class UrlSchemeService : IDisposable
{
    private const string MutexName = "PreeceMeet-SingleInstance-{E7A1B2C3-D4E5-6F78-9012-3456789ABCDE}";
    private const string PipeName  = "PreeceMeet-IPC";

    private Mutex? _mutex;
    private CancellationTokenSource? _serverCts;
    private Thread? _serverThread;

    public event Action<string>? RoomJoinRequested;

    /// <summary>
    /// Returns true if this is the first instance. Returns false if another
    /// instance is already running (caller should forward args and exit).
    /// </summary>
    public bool TryAcquireSingleInstance()
    {
        _mutex = new Mutex(true, MutexName, out bool createdNew);
        return createdNew;
    }

    /// <summary>
    /// Send a room name to the already-running instance via named pipe.
    /// </summary>
    public static void ForwardToRunningInstance(string roomName)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(timeout: 3000);
            using var writer = new StreamWriter(client);
            writer.WriteLine(roomName);
        }
        catch
        {
            // Best effort.
        }
    }

    /// <summary>Start listening for inbound IPC messages from future instances.</summary>
    public void StartIpcServer()
    {
        _serverCts = new CancellationTokenSource();
        _serverThread = new Thread(() => RunServer(_serverCts.Token)) { IsBackground = true, Name = "IPC-Server" };
        _serverThread.Start();
    }

    private void RunServer(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(PipeName, PipeDirection.In, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                // Wait for a connection; check cancellation every second.
                var connectTask = server.WaitForConnectionAsync(ct);
                connectTask.Wait(ct);

                using var reader = new StreamReader(server);
                var message = reader.ReadLine()?.Trim();
                if (!string.IsNullOrEmpty(message))
                    RoomJoinRequested?.Invoke(message);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                // Restart server on any error.
                Thread.Sleep(500);
            }
        }
    }

    // ── Registry registration ─────────────────────────────────────────────────

    /// <summary>
    /// Registers preecemeet:// in HKCU so Windows routes the URL scheme
    /// to this executable. Safe to call on every launch (idempotent).
    /// </summary>
    public static void RegisterUrlScheme()
    {
        try
        {
            var exePath = Environment.ProcessPath ?? System.Diagnostics.Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath)) return;

            using var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Classes\preecemeet");
            key.SetValue("", "URL:PreeceMeet Protocol");
            key.SetValue("URL Protocol", "");

            using var iconKey = key.CreateSubKey("DefaultIcon");
            iconKey.SetValue("", $"\"{exePath}\",0");

            using var commandKey = key.CreateSubKey(@"shell\open\command");
            commandKey.SetValue("", $"\"{exePath}\" \"%1\"");
        }
        catch
        {
            // Non-fatal if registry write fails (e.g. sandboxed environment).
        }
    }

    // ── URL parsing ───────────────────────────────────────────────────────────

    /// <summary>Extracts room name from preecemeet://RoomName or null if not a valid scheme URL.</summary>
    public static string? ParseRoomFromUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!url.StartsWith("preecemeet://", StringComparison.OrdinalIgnoreCase)) return null;
        var room = url["preecemeet://".Length..].TrimEnd('/');
        return string.IsNullOrEmpty(room) ? null : Uri.UnescapeDataString(room);
    }

    public void Dispose()
    {
        _serverCts?.Cancel();
        _mutex?.ReleaseMutex();
        _mutex?.Dispose();
    }
}
