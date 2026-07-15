#!/usr/bin/env bash
# Add Hephaestus to the Linux application launcher (Ubuntu/GNOME, KDE, etc.)
# by installing a freedesktop .desktop entry for the current user.
# Usage: ./install-desktop-entry.sh [--remove]
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$APPS_DIR/hephaestus.desktop"
ICON="$PROJECT_DIR/frontend/electron/icon-tile.png"

if [ "$1" = "--remove" ]; then
    rm -f "$DESKTOP_FILE"
    command -v update-desktop-database >/dev/null 2>&1 \
        && update-desktop-database "$APPS_DIR" || true
    echo "[Hephaestus] Removed from the application list."
    exit 0
fi

if [ ! -f "$ICON" ]; then
    echo "[Hephaestus] Icon not found at $ICON" >&2
    exit 1
fi

chmod +x "$PROJECT_DIR/start.sh" "$PROJECT_DIR/install.sh" 2>/dev/null || true

mkdir -p "$APPS_DIR"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Hephaestus
Comment=Self-hosted AI chat for local Ollama models
Exec="$PROJECT_DIR/start.sh"
Path=$PROJECT_DIR
Icon=$ICON
Terminal=false
Categories=Utility;Chat;
Keywords=AI;chat;ollama;LLM;
StartupWMClass=Hephaestus
EOF
chmod +x "$DESKTOP_FILE"

# Refresh the launcher database so the entry shows up right away.
command -v update-desktop-database >/dev/null 2>&1 \
    && update-desktop-database "$APPS_DIR" || true

if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$DESKTOP_FILE" && echo "[Hephaestus] Entry validated."
fi

echo "[Hephaestus] Added to the application list: $DESKTOP_FILE"
echo "[Hephaestus] Tip: run ./start.sh once from a terminal first so the"
echo "             initial dependency install is visible; launcher runs are silent."
