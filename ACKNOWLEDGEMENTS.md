# Acknowledgements

Hephaestus is built on the shoulders of open-source software. This file
credits the projects it bundles or depends on, with their licenses.

## Bundled front-end libraries

Compiled into the UI bundle (`frontend/dist`) at build time:

| Library | Purpose | License |
| ------- | ------- | ------- |
| [React](https://github.com/facebook/react) / [React DOM](https://github.com/facebook/react) | UI framework | MIT © Meta Platforms, Inc. and affiliates |
| [react-markdown](https://github.com/remarkjs/react-markdown) | Markdown rendering of chat messages | MIT © Espen Hovlandsdal |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | GitHub-flavored Markdown (tables, task lists) | MIT © Titus Wormer |
| [rehype-highlight](https://github.com/rehypejs/rehype-highlight) | Hooks highlight.js into the Markdown pipeline | MIT © Titus Wormer |
| [highlight.js](https://github.com/highlightjs/highlight.js) | Code syntax highlighting | BSD-3-Clause © Ivan Sagalaev |

## Desktop shell & build tools

| Tool | Purpose | License |
| ---- | ------- | ------- |
| [Electron](https://github.com/electron/electron) | Desktop application shell | MIT © Electron contributors; © 2013–2020 GitHub Inc. |
| [Vite](https://github.com/vitejs/vite) | Build tool / dev server | MIT © VoidZero Inc. and Vite contributors |
| [concurrently](https://github.com/open-cli-tools/concurrently) | Runs dev processes side by side | MIT © Kimmo Brunfeldt |
| [cross-env](https://github.com/kentcdodds/cross-env) | Cross-platform env vars in npm scripts | MIT © Kent C. Dodds |
| [wait-on](https://github.com/jeffbski/wait-on) | Waits for the dev server before launching Electron | MIT © Jeff Barczewski |

## Python backend dependencies

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

## Companion services

Not distributed with Hephaestus, but used at runtime:

| Service | Purpose | License |
| ------- | ------- | ------- |
| [Ollama](https://github.com/ollama/ollama) | Local LLM runtime that serves the models | MIT © Ollama Inc. |
| [DuckDuckGo](https://duckduckgo.com) | Search results for the web-search feature | Terms of service apply |

## License-compatibility notes

- All bundled JavaScript libraries are MIT or BSD-3-Clause licensed —
  permissive licenses compatible with each other and with this project.
- fpdf2 is LGPL-3.0: Hephaestus uses it unmodified as an importable
  library, which the LGPL permits without imposing its terms on the rest
  of the project. Its source is available at the repository linked above.
- Full license texts ship with the installed packages themselves
  (`frontend/node_modules/<pkg>/LICENSE` and the Python package metadata
  in `site-packages`).
