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
- 🧰 Models pane — download Ollama models from inside the app with live
  pull progress, a curated list of tested recommendations, and a hardware
  "model fit" report powered by llmfit
- 👤 Multi-user accounts with admin management and chat history
  encrypted at rest (AES-256-GCM) — see Accounts & privacy below
- 🎨 Local image generation (Ideogram 4) hosted directly by the backend —
  no external services; weights load from `models/image/` (not shipped —
  you download them yourself, see `models/README.md`). Fully
  implemented; the UI entry point is currently disabled behind the
  `IMAGE_GENERATION_ENABLED` flag in `frontend/src/App.jsx`
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

| Variable                | Default                  | Purpose                          |
| ----------------------- | ------------------------ | -------------------------------- |
| `OLLAMA_URL`            | `http://localhost:11434` | Where your Ollama lives          |
| `HEPH_PORT`             | `8155`                   | Backend HTTP port                |
| `HEPH_HOST`             | `127.0.0.1`              | Backend bind address             |
| `HEPH_IMAGE_MODELS_DIR` | `models/image`           | Image-generation model weights   |
| `HEPH_DEBUG`            | unset                    | `1` = passwordless debug admin (development only; see `start-debug.bat`) |

Chat history is stored in `backend/data/hephaestus.db`. Local model
weights live under `models/` (see `models/README.md` for the layout).

## Architecture

```
frontend/            Electron + React (Vite)
  electron/          Main process: spawns backend, creates window
  src/               Chat UI (sidebar, messages, composer)
backend/             Python FastAPI server
  main.py            REST + SSE streaming chat endpoint
  imagegen.py        Hosts image models (Ideogram 4) in-process
  websearch.py       DuckDuckGo search + page scraping
  tools.py           File-creation tools exposed to the model
  filereader.py      Extracts text from uploaded files
  db.py              SQLite conversations/messages
models/              Local model weights (image/, chat/) — gitignored
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

## License

Hephaestus is licensed under the [Apache License 2.0](LICENSE).

## Acknowledgements

Hephaestus is built on the shoulders of open-source software. This
section credits the projects it bundles or depends on, with their
licenses.

### Bundled front-end libraries

Compiled into the UI bundle (`frontend/dist`) at build time:

| Library | Purpose | License |
| ------- | ------- | ------- |
| [React](https://github.com/facebook/react) / [React DOM](https://github.com/facebook/react) | UI framework | MIT © Meta Platforms, Inc. and affiliates |
| [react-markdown](https://github.com/remarkjs/react-markdown) | Markdown rendering of chat messages | MIT © Espen Hovlandsdal |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | GitHub-flavored Markdown (tables, task lists) | MIT © Titus Wormer |
| [rehype-highlight](https://github.com/rehypejs/rehype-highlight) | Hooks highlight.js into the Markdown pipeline | MIT © Titus Wormer |
| [highlight.js](https://github.com/highlightjs/highlight.js) | Code syntax highlighting | BSD-3-Clause © Ivan Sagalaev |

### Desktop shell & build tools

| Tool | Purpose | License |
| ---- | ------- | ------- |
| [Electron](https://github.com/electron/electron) | Desktop application shell | MIT © Electron contributors; © 2013–2020 GitHub Inc. |
| [Vite](https://github.com/vitejs/vite) | Build tool / dev server | MIT © VoidZero Inc. and Vite contributors |
| [concurrently](https://github.com/open-cli-tools/concurrently) | Runs dev processes side by side | MIT © Kimmo Brunfeldt |
| [cross-env](https://github.com/kentcdodds/cross-env) | Cross-platform env vars in npm scripts | MIT © Kent C. Dodds |
| [wait-on](https://github.com/jeffbski/wait-on) | Waits for the dev server before launching Electron | MIT © Jeff Barczewski |

### Python backend dependencies

| Library | Purpose | License |
| ------- | ------- | ------- |
| [FastAPI](https://github.com/fastapi/fastapi) | HTTP API framework | MIT © Sebastián Ramírez |
| [Uvicorn](https://github.com/encode/uvicorn) | ASGI server | BSD-3-Clause © Encode OSS Ltd |
| [HTTPX](https://github.com/encode/httpx) | Async HTTP client (Ollama proxy, page fetching) | BSD-3-Clause © Encode OSS Ltd |
| [cryptography](https://github.com/pyca/cryptography) | AES-256-GCM encryption of chat history at rest | Apache-2.0 / BSD-3-Clause (dual) © The pyca/cryptography developers |
| [ddgs](https://github.com/deedy5/ddgs) | DuckDuckGo web search | MIT © deedy5 |
| [Beautiful Soup 4](https://www.crummy.com/software/BeautifulSoup/) | HTML text extraction for web search results | MIT © Leonard Richardson |
| [python-docx](https://github.com/python-openxml/python-docx) | Word document (`.docx`) creation tool | MIT © Steve Canny |
| [openpyxl](https://foss.heptapod.net/openpyxl/openpyxl) | Excel spreadsheet (`.xlsx`) creation tool | MIT © openpyxl contributors (Eric Gazoni, Charlie Clark) |
| [fpdf2](https://github.com/py-pdf/fpdf2) | PDF document creation tool | LGPL-3.0 © PyFPDF/fpdf2 contributors |
| [mammoth](https://github.com/mwilliamson/python-mammoth) | Convert uploaded `.docx` → HTML for the model to read | BSD-2-Clause © Michael Williamson |
| [pypdf](https://github.com/py-pdf/pypdf) | Text extraction from uploaded PDFs | BSD-3-Clause © Mathieu Fenniak and pypdf contributors |

### Optional image-generation dependencies

Installed only via `backend/requirements-image.txt`:

| Library | Purpose | License |
| ------- | ------- | ------- |
| [PyTorch](https://github.com/pytorch/pytorch) | Tensor runtime for local image generation | BSD-3-Clause © PyTorch contributors |
| [Transformers](https://github.com/huggingface/transformers) | Qwen3-VL text-encoder architecture & tokenizer | Apache-2.0 © The HuggingFace team |
| [ideogram4](https://github.com/ideogram-oss/ideogram4) | Official Ideogram 4 inference runtime | See repository license |
| Ideogram 4 model weights | The image model itself | Ideogram open-weights license (gated on [Hugging Face](https://huggingface.co/ideogram-ai/ideogram-4-fp8)) — review before redistribution |

### Companion services

Not distributed with Hephaestus, but used at runtime:

| Service | Purpose | License |
| ------- | ------- | ------- |
| [Ollama](https://github.com/ollama/ollama) | Local LLM runtime that serves the models | MIT © Ollama Inc. |
| [llmfit](https://github.com/AlexsJones/llmfit) | Hardware "model fit" report in the Models pane | See repository license |
| [DuckDuckGo](https://duckduckgo.com) | Search results for the web-search feature | Terms of service apply |

### License-compatibility notes

- All bundled JavaScript libraries are MIT or BSD-3-Clause licensed —
  permissive licenses compatible with each other and with this project's
  Apache-2.0 license.
- fpdf2 is LGPL-3.0: Hephaestus uses it unmodified as an importable
  library, which the LGPL permits without imposing its terms on the rest
  of the project. Its source is available at the repository linked above.
- The Ideogram 4 weights are **not** covered by this project's
  Apache-2.0 license; they are distributed separately under Ideogram's
  own model license and are never committed to this repository.
- Full license texts ship with the installed packages themselves
  (`frontend/node_modules/<pkg>/LICENSE` and the Python package metadata
  in `site-packages`).
