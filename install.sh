#!/usr/bin/env bash
# Hephaestus one-time setup for macOS / Linux.
set -e
cd "$(dirname "$0")"

command -v python3 >/dev/null 2>&1 || {
    echo "[Hephaestus] Python 3 not found. Install it first (https://www.python.org)." >&2
    exit 1
}
command -v npm >/dev/null 2>&1 || {
    echo "[Hephaestus] Node.js/npm not found. Install it first (https://nodejs.org)." >&2
    exit 1
}

echo "[Hephaestus] Setting up Python environment (backend/.venv)..."
if [ ! -d backend/.venv ]; then
    python3 -m venv backend/.venv
fi
backend/.venv/bin/pip install --upgrade pip >/dev/null
backend/.venv/bin/pip install -r backend/requirements.txt

echo "[Hephaestus] Installing frontend dependencies..."
cd frontend
npm install

echo "[Hephaestus] Building UI..."
npm run build

echo "[Hephaestus] Setup complete. Launch the app with ./start.sh"
