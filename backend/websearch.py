"""Real-time web search: DuckDuckGo results + page fetching, no API keys."""

import asyncio

import httpx
from bs4 import BeautifulSoup

try:
    from ddgs import DDGS
except ImportError:  # older package name
    from duckduckgo_search import DDGS

MAX_RESULTS = 6
PAGES_TO_FETCH = 3
PAGE_CHAR_LIMIT = 3000
FETCH_TIMEOUT = 8.0

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        " (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}


def _ddg_search(query: str) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=MAX_RESULTS))


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside",
                     "noscript", "form", "iframe"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = " ".join(main.get_text(separator=" ").split())
    return text[:PAGE_CHAR_LIMIT]


async def _fetch_page(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=FETCH_TIMEOUT,
                                follow_redirects=True)
        resp.raise_for_status()
        if "text/html" not in resp.headers.get("content-type", ""):
            return ""
        return _extract_text(resp.text)
    except Exception:
        return ""


async def search_web(query: str) -> dict:
    """Search DuckDuckGo and pull full text from the top pages.

    Returns {"sources": [{title, url, snippet}], "context": str} where
    context is a text block ready to inject into the model prompt.
    """
    query = query.strip()[:400]
    try:
        results = await asyncio.to_thread(_ddg_search, query)
    except Exception as exc:
        return {"sources": [], "context": "", "error": str(exc)}

    sources = [
        {
            "title": r.get("title", ""),
            "url": r.get("href", r.get("url", "")),
            "snippet": r.get("body", ""),
        }
        for r in results
        if r.get("href") or r.get("url")
    ]

    async with httpx.AsyncClient(headers=_HEADERS) as client:
        pages = await asyncio.gather(
            *(_fetch_page(client, s["url"]) for s in sources[:PAGES_TO_FETCH])
        )

    blocks = []
    for i, source in enumerate(sources):
        block = f"[{i + 1}] {source['title']}\nURL: {source['url']}\n"
        page_text = pages[i] if i < len(pages) else ""
        block += f"Content: {page_text or source['snippet']}"
        blocks.append(block)

    return {"sources": sources, "context": "\n\n".join(blocks)}
