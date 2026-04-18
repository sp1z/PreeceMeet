# PreeceMeet

Cross-platform desktop video conferencing for [meet.russellpreece.com](https://meet.russellpreece.com), built on [LiveKit](https://livekit.io) and packaged with Electron.

## Features

- LiveKit-powered audio + video calls (WebRTC)
- Two-factor authentication (email + password + TOTP)
- Encrypted session persistence
- One-presenter screen / window share
- In-call group chat with optional auto-open of pasted URLs
- Auto-updating across all platforms (electron-updater + GitHub releases)
- Dark UI, responsive video grid, drag-to-reorder tiles, "Game Mode" overlay strip for streaming

## Install

| Platform | Download | Notes |
|---|---|---|
| **Windows** | `PreeceMeet-Setup-X.Y.Z.exe` | Per-user NSIS installer |
| **macOS (Apple Silicon)** | `PreeceMeet-X.Y.Z-arm64.dmg` | Right-click → Open on first launch |
| **macOS (Intel)** | `PreeceMeet-X.Y.Z-x64.dmg` | Right-click → Open on first launch |
| **Linux (any distro)** | `PreeceMeet-X.Y.Z-x64.AppImage` | `chmod +x` then run |
| **Linux (Debian / Ubuntu)** | `PreeceMeet-X.Y.Z-x64.deb` | `sudo apt install ./...deb` |

Latest release: <https://github.com/sp1z/PreeceMeet/releases/latest>

## Repository layout

```
app/                  # Electron desktop client (React + Vite + electron-builder)
├── src/              #   React renderer (UI, LiveKit, chat, settings)
├── electron/         #   main + preload (BrowserWindow, IPC, autoUpdater)
└── build/            #   Icons + electron-builder resources
PreeceMeet.AuthApi/   # ASP.NET Core auth + LiveKit token-issuing service
.github/workflows/
├── build-app.yml     # Build + publish desktop client across Win/Mac/Linux
└── build-api.yml     # Build + push AuthApi container
```

## Building locally

```bash
cd app
npm install
npm run dev          # Vite dev server (renderer only)
npm run electron     # Run Electron pointing at the built dist
npm run dist         # Build a release artifact for your current platform
```

The `dist` script invokes electron-builder, which writes to `dist-electron/`.

## Server

- LiveKit + AuthApi run as Docker containers on `hosting-1` under `/opt/preecemeet/`.
- Apache vhost at `meet.russellpreece.com` proxies `/api` → AuthApi (5050) and `/` → LiveKit (7880); `/rtc` is the WebSocket signalling path.
- AuthApi treats any `@russellpreece.com` email as admin automatically.
