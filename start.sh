#!/usr/bin/env bash
# Launch Hephaestus on macOS / Linux. Runs setup automatically on first use.
set -e
cd "$(dirname "$0")"

if [ ! -d backend/.venv ] || [ ! -d frontend/node_modules ] \
    || [ ! -f frontend/dist/index.html ]; then
    ./install.sh
fi

echo "[Hephaestus] Starting... close the app window to shut everything down."
cd frontend
npx electron .
