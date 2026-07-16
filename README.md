# Hephaestus

A self-hosted AI chat app — an Electron + React desktop UI styled like the
ChatGPT/Claude chat window, backed by a Python (FastAPI) server that talks to
your **local Ollama** instance. No Docker, no cloud services, no API keys.

## Features

- 💬 Chat with any model installed in your local Ollama, with streaming
  responses, Markdown rendering, and syntax-highlighted code blocks
- 🌐 Built-in real-time web search (DuckDuckGo, pure Python) — toggle the
  globe button in the composer and the model answers with cited sources
- 📁 File-creation tools — ask the model to create text, Word (.docx),
  Excel (.xlsx), or PDF files; they are saved to your Downloads folder
- 📎 File uploads — attach a .docx, .xlsx, .pdf, or text/code file from
  the composer's + menu; it is converted to HTML so the model can read,
  summarize, or convert it
- 🗂️ Conversation history stored locally in SQLite (rename, delete, resume)
- 🖥️ Runs fully offline except for the optional web search

## Requirements

- [Ollama](https://ollama.com) running locally (default `localhost:11434`)
  with at least one model pulled
- Python 3.10+
- Node.js 18+

## Setup

The start scripts below install everything automatically on first run, so
manual setup is optional:

```bash
# Windows
pip install -r backend/requirements.txt
cd frontend && npm install

# macOS / Linux (uses a virtualenv at backend/.venv)
./install.sh
```

## Run

### Windows: one click

Double-click **`start.bat`** in the project root. On first run it installs
any missing dependencies and builds the UI, then launches the app. Closing
the app window shuts down the Python backend automatically — even if the
app crashes, the backend watches its parent process and exits on its own.
`stop.bat` exists purely as a safety net to free port 8155 if you ever need
it (you normally won't).

### macOS / Linux: one command

```bash
chmod +x start.sh install.sh   # first time only
./start.sh
```

`start.sh` runs `install.sh` automatically if anything is missing (Python
virtualenv at `backend/.venv`, npm packages, UI build), then launches the
app. The same automatic backend cleanup applies.

On Ubuntu/GNOME (or any freedesktop-compliant Linux), add Hephaestus to the
application launcher with:

```bash
./install-desktop-entry.sh            # adds launcher entry with the app icon
./install-desktop-entry.sh --remove   # takes it back out
```

### Desktop app (production-style)

```bash
cd frontend
npm run start
```

This builds the React app and launches Electron. Electron automatically
starts the Python backend (and shuts it down when the app closes).

### Development (hot reload)

```bash
cd frontend
npm run dev
```

Runs Vite with hot reload and opens Electron pointed at the dev server. The
backend is spawned automatically; you can also run it yourself with
`python backend/main.py`.

### Browser only (no Electron)

```bash
python backend/main.py        # terminal 1
cd frontend && npm run dev:web  # terminal 2 → http://localhost:5173
```

## Configuration

Environment variables (all optional):

| Variable     | Default                  | Purpose                     |
| ------------ | ------------------------ | --------------------------- |
| `OLLAMA_URL` | `http://localhost:11434` | Where your Ollama lives     |
| `HEPH_PORT`  | `8155`                   | Backend HTTP port           |
| `HEPH_HOST`  | `127.0.0.1`              | Backend bind address        |

Chat history is stored in `backend/data/hephaestus.db`.

## Architecture

```
frontend/            Electron + React (Vite)
  electron/          Main process: spawns backend, creates window
  src/               Chat UI (sidebar, messages, composer)
backend/             Python FastAPI server
  main.py            REST + SSE streaming chat endpoint
  websearch.py       DuckDuckGo search + page scraping
  db.py              SQLite conversations/messages
```

The frontend talks to the backend at `http://127.0.0.1:8155/api`; the
backend proxies chat to Ollama's `/api/chat` and streams tokens back over
Server-Sent Events. When web search is enabled, the backend searches
DuckDuckGo, fetches the top result pages, and injects the extracted text
into the prompt with numbered sources the model can cite.

## Accounts & privacy

First launch asks you to create an admin account. Admins can add users from
the account menu (Manage users); new users get a one-time temporary
password and must set their own at first sign-in. The app also works fully
signed-out (anonymous chats, kept separate from every account).

Signed-in users' chat history is **encrypted at rest** (AES-256-GCM). Each
user has a random data key that is stored only wrapped by a key derived
from their password, so nobody — including the admin or anyone with the
database file — can read their history without their password. The
practical consequences:

- Changing your own password keeps your history (the key is rewrapped).
- An admin password reset **permanently deletes** that user's history —
  it cannot be decrypted without the old password, by design.
- Restarting the backend signs everyone out (decryption keys live only in
  memory while you're signed in).
- Anonymous (signed-out) chats are stored unencrypted.
