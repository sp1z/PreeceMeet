#!/usr/bin/env bash
# Universal Linux installer for PreeceMeet via Flatpak.
# Works on any distro that has apt/dnf/pacman/zypper.
#
# Usage:
#   curl -L https://raw.githubusercontent.com/sp1z/PreeceMeet/main/install-linux.sh | bash
#
set -euo pipefail

REPO="sp1z/PreeceMeet"
APP_ID="com.russellpreece.PreeceMeet"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# 1) Make sure flatpak is installed.
if ! command -v flatpak >/dev/null; then
  say "flatpak not found — installing via system package manager…"
  if command -v apt-get >/dev/null; then
    sudo apt-get update && sudo apt-get install -y flatpak
  elif command -v dnf >/dev/null; then
    sudo dnf install -y flatpak
  elif command -v pacman >/dev/null; then
    sudo pacman -S --noconfirm flatpak
  elif command -v zypper >/dev/null; then
    sudo zypper install -y flatpak
  else
    err "Could not detect package manager. Install flatpak manually then re-run."
  fi
fi

# 2) Make sure Flathub is registered (user scope — no sudo required).
say "Ensuring Flathub remote is configured…"
flatpak remote-add --user --if-not-exists \
  flathub https://dl.flathub.org/repo/flathub.flatpakrepo

# 3) Find the latest release.
say "Looking up latest PreeceMeet release…"
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | sed -n 's/.*"tag_name": *"\(tauri-v[^"]*\)".*/\1/p' | head -n 1)
[ -n "${TAG:-}" ] || err "Could not determine latest release tag from GitHub."
VERSION="${TAG#tauri-v}"
URL="https://github.com/${REPO}/releases/download/${TAG}/PreeceMeet_${VERSION}_amd64.flatpak"

# 4) Download the bundle.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
say "Downloading PreeceMeet v${VERSION}…"
curl -fL -o "${TMP}/preecemeet.flatpak" "$URL"

# 5) Install it (user scope, pulls org.gnome.Platform from Flathub on first run).
say "Installing — this will pull the GNOME runtime from Flathub on first install (~600 MB)…"
flatpak install --user -y --noninteractive "${TMP}/preecemeet.flatpak"

cat <<EOF

\033[1;32m✓ Installed.\033[0m

Run it with:
  flatpak run ${APP_ID}

Or, after a desktop session restart, find "PreeceMeet" in your application menu.
EOF
