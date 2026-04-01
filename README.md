# PreeceMeet

Native WPF video conferencing client for [meet.russellpreece.com](https://meet.russellpreece.com), built on the [LiveKit](https://livekit.io) real-time platform.

## Features

- Native LiveKit video/audio (no WebView2 / browser embedding)
- Two-factor authentication (email + password + TOTP)
- Encrypted session persistence via Windows DPAPI
- Custom URL scheme: `preecemeet://RoomName`
- Single-instance enforcement with named-pipe IPC
- Self-installing and auto-updating via [Velopack](https://velopack.io)
- Configurable camera, microphone, server URL
- Dark-themed, responsive video grid (UniformGrid layout)

## Requirements

- Windows 10 or later
- .NET 8 Desktop Runtime

## Building

```powershell
dotnet restore
dotnet build
```

## Publishing

```powershell
dotnet publish PreeceMeet/PreeceMeet.csproj -c Release -r win-x64 --self-contained -o publish/
vpk pack --packId PreeceMeet --packVersion 1.0.0 --packDir publish/ --mainExe PreeceMeet.exe --outputDir releases/
```

## Custom URL Scheme

After first launch the app registers `preecemeet://` in `HKCU\Software\Classes\preecemeet`.
Opening `preecemeet://my-room` from any browser or shortcut will join the room `my-room`.

## Architecture

```
App.xaml.cs          Single-instance mutex, Velopack init, URL scheme, service wiring
Views/
  LoginWindow        Email + password login
  TotpWindow         6-digit TOTP entry
  MainWindow         Toolbar, video grid, media controls
  SettingsWindow     Preferences, device selection, sign out
Controls/
  VideoGridControl   UniformGrid layout of participant tiles
  VideoTileControl   Single tile: LiveKit VideoTrack → WriteableBitmap
Services/
  AuthService        HTTP calls to /api/auth/login, /verify-totp, /refresh
  SessionService     DPAPI-encrypted session persistence
  SettingsService    JSON settings in %APPDATA%\PreeceMeet\settings.json
  LiveKitService     LiveKit Room wrapper with observable participant collection
  UrlSchemeService   Registry registration + named-pipe IPC server
Models/
  AppSettings        Settings DTO
  AuthModels         Request/response DTOs for auth API
```
