"""Hephaestus backend: FastAPI bridge between the Electron UI and Ollama."""

import asyncio
import json
import os
import shutil
import subprocess
import sys
import sysconfig
import threading
import time
from datetime import date

import httpx
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import auth
import crypto
import db
import filereader
import imagegen
import tools
import websearch

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
HOST = os.environ.get("HEPH_HOST", "127.0.0.1")
PORT = int(os.environ.get("HEPH_PORT", "8155"))

# HEPH_DEBUG=1 skips sign-in: a throwaway "debug-admin" account is
# recreated on every debug start and auto-deleted on normal starts.
DEBUG_MODE = os.environ.get("HEPH_DEBUG") == "1"
DEBUG_USERNAME = "debug-admin"
DEBUG_TOKEN: str | None = None

SYSTEM_PROMPT = (
    "You are Hephaestus, a helpful AI assistant running locally on the"
    " user's machine. Answer clearly and use Markdown formatting where it"
    " helps (code blocks, lists, tables). You have tools to create files"
    " (text, Word, Excel, PDF) in the user's Downloads folder — use them"
    " when the user asks you to create, save, or export a file, and only"
    " then. Today's date is {today}."
)

MAX_TOOL_ROUNDS = 4

SEARCH_PROMPT = (
    "Web search results for the user's request are provided below. Use them"
    " to give an accurate, up-to-date answer, and cite sources inline with"
    " bracketed numbers like [1] that match the result numbers.\n\n"
    "=== WEB SEARCH RESULTS ===\n{context}\n=== END OF RESULTS ==="
)

app = FastAPI(title="Hephaestus")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local-only app; backend binds to 127.0.0.1
    allow_methods=["*"],
    allow_headers=["*"],
)
db.init_db()
# History decryption keys live only in process memory, keyed by session
# token. They exist solely between a login and a logout/shutdown, so all
# sessions from a previous run are useless — clear them.
db.clear_all_sessions()
SESSION_DEKS: dict[str, bytes] = {}


class FileAttachment(BaseModel):
    name: str
    data: str  # data URL or base64


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    model: str
    message: str
    web_search: bool = False
    images: list[str] | None = None
    files: list[FileAttachment] | None = None
    think: bool | None = None  # None = model default


class ConversationPatch(BaseModel):
    title: str | None = None
    model: str | None = None


class SetupRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AddUserRequest(BaseModel):
    username: str


class AvatarRequest(BaseModel):
    avatar: str


class PullModelRequest(BaseModel):
    model: str


class ImageGenRequest(BaseModel):
    conversation_id: str | None = None
    model: str
    message: str
    width: int | None = None
    height: int | None = None
    seed: int | None = None


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


MAX_IMAGE_CHARS = 20_000_000  # ~15 MB of image data as base64
MAX_IMAGES_PER_MESSAGE = 4


def _validate_images(images: list[str] | None) -> list[str]:
    images = images or []
    if len(images) > MAX_IMAGES_PER_MESSAGE:
        raise HTTPException(status_code=400, detail="Too many images")
    for img in images:
        if not img.startswith("data:image/"):
            raise HTTPException(status_code=400,
                                detail="Images must be image data URLs")
        if len(img) > MAX_IMAGE_CHARS:
            raise HTTPException(status_code=400,
                                detail="Image too large (max 15 MB)")
    return images


def _raw_b64(data_url: str) -> str:
    """Ollama wants bare base64, without the data-URL prefix."""
    return data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url


MAX_FILES_PER_MESSAGE = 4
MAX_FILE_CHARS = 30_000_000  # ~22 MB of file data as base64


def _extract_files(files: list[FileAttachment] | None) -> list[dict]:
    files = files or []
    if len(files) > MAX_FILES_PER_MESSAGE:
        raise HTTPException(status_code=400, detail="Too many files")
    for f in files:
        if len(f.data) > MAX_FILE_CHARS:
            raise HTTPException(status_code=400,
                                detail=f"File too large: {f.name}")
    return [filereader.extract(f.name, f.data) for f in files]


def _with_file_context(content: str, files: list | None) -> str:
    """Prefix a message with the extracted content of its attachments."""
    if not files:
        return content
    parts = []
    for f in files:
        if f.get("content"):
            parts.append(
                f"=== ATTACHED FILE: {f['name']} ===\n"
                f"{f['content']}\n=== END OF FILE ==="
            )
        else:
            parts.append(
                f"(The attached file {f['name']} could not be read:"
                f" {f.get('error') or 'unknown error'})"
            )
    return "\n\n".join(parts) + "\n\n" + content


def _public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "username": u["username"],
        "is_admin": bool(u["is_admin"]),
        "must_change_password": bool(u["must_change_password"]),
        "avatar": u.get("avatar"),
        "created_at": u["created_at"],
    }


def _validate_username(username: str) -> str:
    username = username.strip()
    if not (2 <= len(username) <= 32) or not all(
        c.isalnum() or c in "._- " for c in username
    ):
        raise HTTPException(
            status_code=400,
            detail="Username must be 2-32 characters"
                   " (letters, numbers, . _ - and spaces).",
        )
    return username


def _validate_password(password: str) -> str:
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )
    return password


def _token_from_header(authorization: str | None) -> str | None:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


async def current_user(
    authorization: str | None = Header(default=None),
) -> dict | None:
    token = _token_from_header(authorization)
    if not token:
        return None
    user = db.get_session_user(token)
    if not user:
        return None
    dek = SESSION_DEKS.get(token)
    if dek is None:
        # A session without its in-memory key can't read or safely write
        # encrypted history — treat it as signed out.
        db.delete_session(token)
        return None
    user["_token"] = token
    user["_dek"] = dek
    return user


async def require_user(user: dict | None = Depends(current_user)) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


async def require_admin(user: dict = Depends(require_user)) -> dict:
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ---------- Auth ----------

@app.get("/api/auth/status")
async def auth_status(user: dict | None = Depends(current_user)):
    return {
        "setup_required": not DEBUG_MODE and db.count_users() == 0,
        "user": _public_user(user) if user else None,
        "debug": DEBUG_MODE,
    }


@app.post("/api/auth/debug-login")
async def auth_debug_login():
    """Hand out the pre-minted debug session (debug mode only)."""
    if not DEBUG_MODE or not DEBUG_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    user = db.get_session_user(DEBUG_TOKEN)
    if not user or DEBUG_TOKEN not in SESSION_DEKS:
        raise HTTPException(status_code=404, detail="Not found")
    return {"token": DEBUG_TOKEN, "user": _public_user(user)}


def _create_user_keys(user_id: str, password: str) -> bytes:
    """Generate a fresh data key for a user, wrapped by their password."""
    enc_salt = crypto.new_salt()
    dek = crypto.new_dek()
    kek = crypto.derive_kek(password, enc_salt)
    db.set_user_keys(user_id, enc_salt, crypto.wrap_dek(kek, dek))
    return dek


def _unlock_dek(user: dict, password: str) -> bytes:
    """Unwrap the user's data key at login; create keys on first
    encrypted login (migrating any plaintext history)."""
    if not user.get("wrapped_dek"):
        dek = _create_user_keys(user["id"], password)
        db.encrypt_existing_history(user["id"], dek)
        return dek
    kek = crypto.derive_kek(password, user["enc_salt"])
    dek = crypto.unwrap_dek(kek, user["wrapped_dek"])
    if dek is None:
        # Password verified but key won't unwrap — should never happen.
        raise HTTPException(status_code=500,
                            detail="Could not unlock chat history key")
    return dek


def _init_debug_account() -> None:
    """Create (debug mode) or remove (normal mode) the throwaway admin.

    The account gets a random password that is never revealed, so the
    only way in is the pre-minted session below — and normal startups
    delete the account entirely, along with its conversations.
    """
    global DEBUG_TOKEN
    existing = db.get_user_by_username(DEBUG_USERNAME)
    if existing:
        db.delete_user(existing["id"])
    if not DEBUG_MODE:
        return
    password = os.urandom(32).hex()
    salt, digest = auth.hash_password(password)
    user = db.create_user(DEBUG_USERNAME, salt, digest, is_admin=True)
    dek = _create_user_keys(user["id"], password)
    DEBUG_TOKEN = auth.generate_session_token()
    db.create_session(DEBUG_TOKEN, user["id"])
    SESSION_DEKS[DEBUG_TOKEN] = dek
    print(f"[Hephaestus] WARNING: HEPH_DEBUG=1 — signed in as"
          f" '{DEBUG_USERNAME}' without authentication. Do not use"
          f" this mode with real data.", file=sys.stderr)


_init_debug_account()


@app.post("/api/auth/setup")
async def auth_setup(req: SetupRequest):
    if db.count_users() > 0:
        raise HTTPException(status_code=400,
                            detail="Setup has already been completed")
    username = _validate_username(req.username)
    password = _validate_password(req.password)
    salt, digest = auth.hash_password(password)
    user = db.create_user(username, salt, digest, is_admin=True)
    dek = _create_user_keys(user["id"], password)
    token = auth.generate_session_token()
    db.create_session(token, user["id"])
    SESSION_DEKS[token] = dek
    return {"token": token, "user": _public_user(user)}


@app.post("/api/auth/login")
async def auth_login(req: LoginRequest):
    if req.username.strip().lower() == DEBUG_USERNAME:
        # The debug account is session-injected only, never logged into.
        raise HTTPException(status_code=401,
                            detail="Invalid username or password")
    user = db.get_user_by_username(req.username.strip())
    if not user or not auth.verify_password(
        req.password, user["password_salt"], user["password_hash"]
    ):
        raise HTTPException(status_code=401,
                            detail="Invalid username or password")
    dek = _unlock_dek(user, req.password)
    token = auth.generate_session_token()
    db.create_session(token, user["id"])
    SESSION_DEKS[token] = dek
    return {"token": token, "user": _public_user(user)}


@app.post("/api/auth/logout")
async def auth_logout(authorization: str | None = Header(default=None),
                      _: dict = Depends(require_user)):
    token = _token_from_header(authorization)
    if token:
        db.delete_session(token)
        SESSION_DEKS.pop(token, None)
    return {"ok": True}


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(require_user)):
    return _public_user(user)


@app.post("/api/auth/change-password")
async def change_password(req: ChangePasswordRequest,
                          user: dict = Depends(require_user)):
    if not auth.verify_password(
        req.current_password, user["password_salt"], user["password_hash"]
    ):
        raise HTTPException(status_code=401,
                            detail="Current password is incorrect")
    password = _validate_password(req.new_password)
    salt, digest = auth.hash_password(password)
    db.set_user_password(user["id"], salt, digest,
                         must_change_password=False)
    # Rewrap the history key under the new password (data untouched).
    kek_old = crypto.derive_kek(req.current_password, user["enc_salt"])
    dek = crypto.unwrap_dek(kek_old, user["wrapped_dek"])
    if dek is not None:
        enc_salt = crypto.new_salt()
        kek_new = crypto.derive_kek(password, enc_salt)
        db.set_user_keys(user["id"], enc_salt, crypto.wrap_dek(kek_new, dek))
    return {"ok": True}


@app.post("/api/auth/avatar")
async def set_avatar(req: AvatarRequest, user: dict = Depends(require_user)):
    # The frontend crops/resizes to a 128px PNG before uploading.
    if not req.avatar.startswith("data:image/png;base64,"):
        raise HTTPException(status_code=400,
                            detail="Avatar must be a PNG data URL")
    if len(req.avatar) > 300_000:
        raise HTTPException(status_code=400, detail="Avatar image too large")
    db.set_user_avatar(user["id"], req.avatar)
    return {"ok": True, "avatar": req.avatar}


@app.delete("/api/auth/avatar")
async def remove_avatar(user: dict = Depends(require_user)):
    db.set_user_avatar(user["id"], None)
    return {"ok": True}


# ---------- User management (admin) ----------

@app.get("/api/users")
async def users_list(_: dict = Depends(require_admin)):
    return {"users": [_public_user(u) for u in db.list_users()]}


@app.post("/api/users")
async def users_add(req: AddUserRequest, _: dict = Depends(require_admin)):
    username = _validate_username(req.username)
    if db.get_user_by_username(username):
        raise HTTPException(status_code=409,
                            detail="That username already exists")
    temp_password = auth.generate_temp_password()
    salt, digest = auth.hash_password(temp_password)
    user = db.create_user(username, salt, digest, is_admin=False,
                          must_change_password=True)
    _create_user_keys(user["id"], temp_password)
    return {"user": _public_user(user), "temp_password": temp_password}


@app.post("/api/users/{user_id}/reset-password")
async def users_reset_password(user_id: str,
                               admin: dict = Depends(require_admin)):
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == admin["id"]:
        raise HTTPException(
            status_code=400,
            detail="Use Change password for your own account",
        )
    temp_password = auth.generate_temp_password()
    salt, digest = auth.hash_password(temp_password)
    db.set_user_password(target["id"], salt, digest,
                         must_change_password=True)
    db.delete_user_sessions(target["id"])  # force them to log back in
    # Their history key was wrapped by the old password, which the admin
    # does not know — the encrypted history is unrecoverable by design.
    # Remove it and issue a fresh key under the temp password.
    db.delete_user_conversations(target["id"])
    _create_user_keys(target["id"], temp_password)
    return {"user": _public_user(db.get_user(user_id)),
            "temp_password": temp_password}


@app.delete("/api/users/{user_id}")
async def users_delete(user_id: str, admin: dict = Depends(require_admin)):
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=400,
                            detail="You cannot delete your own account")
    db.delete_user(user_id)
    return {"ok": True}


_caps_cache: dict[str, list] = {}


async def _model_capabilities(client: httpx.AsyncClient, name: str) -> list:
    if name not in _caps_cache:
        try:
            resp = await client.post(f"{OLLAMA_URL}/api/show",
                                     json={"model": name}, timeout=5.0)
            resp.raise_for_status()
            _caps_cache[name] = resp.json().get("capabilities", [])
        except httpx.HTTPError:
            return []
    return _caps_cache[name]


@app.get("/api/models")
async def models():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags", timeout=5.0)
            resp.raise_for_status()
            data = resp.json()
            out = []
            for m in data.get("models", []):
                out.append({
                    "name": m["name"],
                    "size": m.get("size"),
                    "parameter_size":
                        m.get("details", {}).get("parameter_size"),
                    "capabilities":
                        await _model_capabilities(client, m["name"]),
                })
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Cannot reach Ollama at {OLLAMA_URL}: {exc}",
        )
    return {"models": out}


@app.post("/api/models/pull")
async def pull_model(req: PullModelRequest,
                     _: dict = Depends(require_user)):
    """Download a model into the local Ollama instance, streaming
    progress as SSE. This is the same download `ollama run <model>`
    performs before it can start the model."""
    name = req.model.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Model name required")

    async def stream():
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/pull",
                    json={"model": name},
                    timeout=httpx.Timeout(None, connect=10.0),
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode(errors="replace")
                        try:
                            body = json.loads(body).get("error") or body
                        except json.JSONDecodeError:
                            pass
                        yield _sse({"type": "error",
                                    "content": f"Ollama error: {body}"})
                        return
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        chunk = json.loads(line)
                        if chunk.get("error"):
                            yield _sse({"type": "error",
                                        "content": chunk["error"]})
                            return
                        yield _sse({
                            "type": "progress",
                            "status": chunk.get("status", ""),
                            "total": chunk.get("total"),
                            "completed": chunk.get("completed"),
                        })
        except httpx.HTTPError as exc:
            yield _sse({"type": "error",
                        "content": f"Cannot reach Ollama: {exc}"})
            return
        # The fresh model's capabilities are unknown — drop any stale entry.
        _caps_cache.pop(name, None)
        yield _sse({"type": "done"})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- Image generation ----------

def _image_dim(value: int | None, default: int = 1024) -> int:
    """Clamp to Ideogram 4's supported range: 256-2048, multiples of 16."""
    if value is None:
        return default
    return max(256, min(2048, (value // 16) * 16))


@app.get("/api/image/models")
async def image_models():
    return {"installed": imagegen.deps_installed(),
            "models": imagegen.list_models()}


@app.post("/api/image/generate")
async def image_generate(req: ImageGenRequest,
                         user: dict | None = Depends(current_user)):
    if not imagegen.deps_installed():
        raise HTTPException(
            status_code=503,
            detail="Image generation runtime is not installed. Run:"
                   " pip install -r backend/requirements-image.txt"
                   " and restart Hephaestus.",
        )
    prompt = req.message.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt required")

    if req.conversation_id:
        conv = _owned_conversation(req.conversation_id, user)
    else:
        conv = db.create_conversation(
            model=req.model, user_id=user["id"] if user else None
        )
    conv_id = conv["id"]
    dek = _dek(user)

    if not db.list_messages(conv_id, dek=dek):
        title = prompt.replace("\n", " ")
        db.update_conversation(
            conv_id,
            title=title[:60] + ("…" if len(title) > 60 else ""),
            model=req.model,
            dek=dek,
        )
    else:
        db.update_conversation(conv_id, model=req.model)

    width = _image_dim(req.width)
    height = _image_dim(req.height)

    async def stream():
        yield _sse({"type": "conversation", "conversation_id": conv_id,
                    "title": db.get_conversation(conv_id, dek=dek)["title"]})
        db.add_message(conv_id, "user", prompt, dek=dek)

        loop = asyncio.get_running_loop()
        events: asyncio.Queue = asyncio.Queue()

        def progress(msg: str) -> None:
            loop.call_soon_threadsafe(
                events.put_nowait, {"type": "status", "content": msg})

        fut = asyncio.ensure_future(asyncio.to_thread(
            imagegen.generate, req.model, prompt,
            width=width, height=height, seed=req.seed, progress=progress,
        ))
        while not fut.done():
            try:
                yield _sse(await asyncio.wait_for(events.get(), timeout=0.5))
            except asyncio.TimeoutError:
                pass
        while not events.empty():
            yield _sse(events.get_nowait())

        try:
            data_url = fut.result()
        except Exception as exc:  # torch/HF errors are worth surfacing
            yield _sse({"type": "error", "content": str(exc)[:2000]})
            return
        db.add_message(conv_id, "assistant", "", images=[data_url], dek=dek)
        yield _sse({"type": "image", "content": data_url})
        yield _sse({"type": "done"})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _find_llmfit() -> str | None:
    exe = shutil.which("llmfit")
    if exe:
        return exe
    # `pip install --user llmfit` lands in a Scripts dir that is often
    # not on PATH (notably with the Microsoft Store Python).
    name = "llmfit.exe" if os.name == "nt" else "llmfit"
    for scheme in (f"{os.name}_user", None):
        try:
            scripts = (sysconfig.get_path("scripts", scheme) if scheme
                       else sysconfig.get_path("scripts"))
        except KeyError:
            continue
        candidate = os.path.join(scripts, name)
        if os.path.isfile(candidate):
            return candidate
    return None


@app.get("/api/hardware")
async def hardware(_: dict = Depends(require_user)):
    """What models fit this machine, via the llmfit CLI (if installed)."""
    exe = _find_llmfit()
    if not exe:
        return {"installed": False}

    def run():
        return subprocess.run(
            [exe, "recommend", "--json"],
            capture_output=True, text=True, timeout=120,
        )

    try:
        proc = await asyncio.to_thread(run)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="llmfit timed out")
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()[:500]
        raise HTTPException(status_code=502,
                            detail=detail or "llmfit failed")
    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502,
                            detail="llmfit returned unexpected output")
    return {"installed": True, "report": report}


def _dek(user: dict | None) -> bytes | None:
    return user["_dek"] if user else None


def _owned_conversation(conv_id: str, user: dict | None) -> dict:
    conv = db.get_conversation(conv_id, dek=_dek(user))
    user_id = user["id"] if user else None
    if not conv or conv.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.get("/api/conversations")
async def conversations(user: dict | None = Depends(current_user)):
    user_id = user["id"] if user else None
    return {"conversations": db.list_conversations(user_id, dek=_dek(user))}


@app.post("/api/conversations")
async def create_conversation(user: dict | None = Depends(current_user)):
    return db.create_conversation(user_id=user["id"] if user else None)


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str,
                           user: dict | None = Depends(current_user)):
    conv = _owned_conversation(conv_id, user)
    conv["messages"] = db.list_messages(conv_id, dek=_dek(user))
    return conv


@app.patch("/api/conversations/{conv_id}")
async def patch_conversation(conv_id: str, patch: ConversationPatch,
                             user: dict | None = Depends(current_user)):
    _owned_conversation(conv_id, user)
    db.update_conversation(conv_id, title=patch.title, model=patch.model,
                           dek=_dek(user))
    return db.get_conversation(conv_id, dek=_dek(user))


@app.delete("/api/conversations/{conv_id}")
async def remove_conversation(conv_id: str,
                              user: dict | None = Depends(current_user)):
    _owned_conversation(conv_id, user)
    db.delete_conversation(conv_id)
    return {"ok": True}


@app.post("/api/chat")
async def chat(req: ChatRequest,
               user: dict | None = Depends(current_user)):
    if req.conversation_id:
        conv = _owned_conversation(req.conversation_id, user)
    else:
        conv = db.create_conversation(
            model=req.model, user_id=user["id"] if user else None
        )

    images = _validate_images(req.images)
    file_items = _extract_files(req.files)

    conv_id = conv["id"]
    dek = _dek(user)
    history = db.list_messages(conv_id, dek=dek)

    # First message titles the conversation.
    if not history:
        title = (req.message.strip().replace("\n", " ")
                 or (file_items[0]["name"] if file_items else "Image"))
        db.update_conversation(
            conv_id,
            title=title[:60] + ("…" if len(title) > 60 else ""),
            model=req.model,
            dek=dek,
        )
    else:
        db.update_conversation(conv_id, model=req.model)

    async def stream():
        yield _sse({"type": "conversation", "conversation_id": conv_id,
                    "title": db.get_conversation(conv_id, dek=dek)["title"]})

        sources = None
        search_context = ""
        if req.web_search:
            yield _sse({"type": "status", "content": "Searching the web…"})
            result = await websearch.search_web(req.message)
            sources = result["sources"] or None
            search_context = result["context"]
            if result.get("error"):
                yield _sse({"type": "status",
                            "content": f"Search failed: {result['error']}"})
            elif sources:
                yield _sse({"type": "sources", "sources": sources})

        db.add_message(conv_id, "user", req.message, images=images or None,
                       files=file_items or None, dek=dek)

        messages = [{
            "role": "system",
            "content": SYSTEM_PROMPT.format(today=date.today().isoformat()),
        }]
        for m in history:
            msg = {"role": m["role"],
                   "content": _with_file_context(m["content"],
                                                 m.get("files"))}
            if m.get("images"):
                msg["images"] = [_raw_b64(i) for i in m["images"]]
            messages.append(msg)
        user_content = req.message
        if search_context:
            user_content = (
                SEARCH_PROMPT.format(context=search_context)
                + f"\n\nUser request: {req.message}"
            )
        user_content = _with_file_context(user_content, file_items)
        user_msg = {"role": "user", "content": user_content}
        if images:
            user_msg["images"] = [_raw_b64(i) for i in images]
        messages.append(user_msg)

        assistant_text = ""
        tool_events = []
        use_tools = True
        use_think = req.think is not None
        thinking_seen = False
        try:
            async with httpx.AsyncClient() as client:
                for round_no in range(MAX_TOOL_ROUNDS + 1):
                    # Last round gets no tools so the model must answer.
                    send_tools = use_tools and round_no < MAX_TOOL_ROUNDS
                    payload = {"model": req.model, "messages": messages,
                               "stream": True}
                    if send_tools:
                        payload["tools"] = tools.TOOL_DEFS
                    if use_think:
                        payload["think"] = req.think
                    tool_calls = []
                    async with client.stream(
                        "POST",
                        f"{OLLAMA_URL}/api/chat",
                        json=payload,
                        timeout=httpx.Timeout(600.0, connect=10.0),
                    ) as resp:
                        if resp.status_code != 200:
                            body = (await resp.aread()).decode(
                                errors="replace")
                            low = body.lower()
                            # Model without tool/think support: retry without.
                            if send_tools and "tool" in low:
                                use_tools = False
                                continue
                            if use_think and "think" in low:
                                use_think = False
                                continue
                            yield _sse({"type": "error",
                                        "content": f"Ollama error: {body}"})
                            return
                        async for line in resp.aiter_lines():
                            if not line.strip():
                                continue
                            chunk = json.loads(line)
                            msg = chunk.get("message", {})
                            if msg.get("thinking") and not thinking_seen:
                                thinking_seen = True
                                yield _sse({"type": "status",
                                            "content": "Thinking…"})
                            token = msg.get("content", "")
                            if token:
                                assistant_text += token
                                yield _sse({"type": "token",
                                            "content": token})
                            tool_calls += msg.get("tool_calls") or []
                            if chunk.get("done"):
                                break

                    if not tool_calls:
                        break
                    messages.append({"role": "assistant", "content": "",
                                     "tool_calls": tool_calls})
                    for tc in tool_calls:
                        fn = tc.get("function", {})
                        name = fn.get("name", "")
                        result = tools.execute_tool(
                            name, fn.get("arguments") or {})
                        event = {"name": name, **result}
                        tool_events.append(event)
                        yield _sse({"type": "tool_event", "event": event})
                        messages.append({"role": "tool", "tool_name": name,
                                         "content": json.dumps(result)})
        except httpx.HTTPError as exc:
            yield _sse({"type": "error",
                        "content": f"Cannot reach Ollama: {exc}"})
        finally:
            # Persist whatever was generated, even if the client aborted.
            if assistant_text or tool_events:
                db.add_message(conv_id, "assistant", assistant_text, sources,
                               tool_events=tool_events or None, dek=dek)

        yield _sse({"type": "done"})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _watch_parent(pid: int) -> None:
    """Exit when the process that spawned us (Electron) is gone, so no
    orphaned backend survives a crash or force-kill of the app."""
    if sys.platform == "win32":
        import ctypes
        SYNCHRONIZE = 0x00100000
        INFINITE = 0xFFFFFFFF
        handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, pid)
        if not handle:  # parent already gone
            os._exit(0)
        ctypes.windll.kernel32.WaitForSingleObject(handle, INFINITE)
    else:
        while True:
            time.sleep(2)
            try:
                os.kill(pid, 0)
            except OSError:
                break
    os._exit(0)


if __name__ == "__main__":
    parent_pid = os.environ.get("HEPH_PARENT_PID")
    if parent_pid and parent_pid.isdigit():
        threading.Thread(
            target=_watch_parent, args=(int(parent_pid),), daemon=True
        ).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
