"""SQLite persistence for conversations and messages."""

import json
import sqlite3
import time
import uuid
from pathlib import Path

import crypto

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "hephaestus.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'New chat',
                model TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL
                    REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id, created_at);
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                must_change_password INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
                created_at REAL NOT NULL
            );
            """
        )
        # Migration: conversations created before accounts existed
        cols = [r["name"] for r in conn.execute(
            "PRAGMA table_info(conversations)")]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE conversations ADD COLUMN user_id TEXT")
        # Migration: users created before avatars existed
        ucols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "avatar" not in ucols:
            conn.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
        # Migration: users created before history encryption existed
        if "enc_salt" not in ucols:
            conn.execute("ALTER TABLE users ADD COLUMN enc_salt TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN wrapped_dek TEXT")
        # Migration: messages created before image attachments existed
        mcols = [r["name"] for r in conn.execute(
            "PRAGMA table_info(messages)")]
        if "images" not in mcols:
            conn.execute("ALTER TABLE messages ADD COLUMN images TEXT")
        # Migration: messages created before file-creation tools existed
        if "tool_events" not in mcols:
            conn.execute("ALTER TABLE messages ADD COLUMN tool_events TEXT")
        # Migration: messages created before file uploads existed
        if "files" not in mcols:
            conn.execute("ALTER TABLE messages ADD COLUMN files TEXT")


def list_conversations(user_id: str | None = None,
                       dek: bytes | None = None) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM conversations WHERE user_id IS ?"
            " ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    convs = [dict(r) for r in rows]
    for c in convs:
        c["title"] = crypto.decrypt_text(dek, c["title"])
    return convs


def create_conversation(title: str = "New chat", model: str = "",
                        user_id: str | None = None) -> dict:
    now = time.time()
    conv = {
        "id": uuid.uuid4().hex,
        "title": title,
        "model": model,
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }
    with _connect() as conn:
        conn.execute(
            "INSERT INTO conversations (id, title, model, user_id,"
            " created_at, updated_at) VALUES (:id, :title, :model, :user_id,"
            " :created_at, :updated_at)",
            conv,
        )
    return conv


def get_conversation(conv_id: str,
                     dek: bytes | None = None) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        ).fetchone()
    if not row:
        return None
    conv = dict(row)
    conv["title"] = crypto.decrypt_text(dek, conv["title"])
    return conv


def update_conversation(conv_id: str, *, title: str | None = None,
                        model: str | None = None,
                        dek: bytes | None = None) -> None:
    sets, params = ["updated_at = ?"], [time.time()]
    if title is not None:
        sets.append("title = ?")
        params.append(crypto.encrypt_text(dek, title) if dek else title)
    if model is not None:
        sets.append("model = ?")
        params.append(model)
    params.append(conv_id)
    with _connect() as conn:
        conn.execute(
            f"UPDATE conversations SET {', '.join(sets)} WHERE id = ?", params
        )


def delete_conversation(conv_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))


def list_messages(conv_id: str, dek: bytes | None = None) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ?"
            " ORDER BY created_at",
            (conv_id,),
        ).fetchall()
    out = []
    for r in rows:
        msg = dict(r)
        msg["content"] = crypto.decrypt_text(dek, msg["content"])
        for field in ("sources", "images", "tool_events", "files"):
            raw = msg.get(field)
            if raw:
                raw = crypto.decrypt_text(dek, raw)
                try:
                    msg[field] = json.loads(raw)
                except ValueError:
                    msg[field] = None
            else:
                msg[field] = None
        out.append(msg)
    return out


def _stored_json(value: list | None, dek: bytes | None) -> str | None:
    if not value:
        return None
    stored = json.dumps(value)
    return crypto.encrypt_text(dek, stored) if dek else stored


def add_message(conv_id: str, role: str, content: str,
                sources: list | None = None,
                images: list | None = None,
                tool_events: list | None = None,
                files: list | None = None,
                dek: bytes | None = None) -> dict:
    msg = {
        "id": uuid.uuid4().hex,
        "conversation_id": conv_id,
        "role": role,
        "content": crypto.encrypt_text(dek, content) if dek else content,
        "sources": _stored_json(sources, dek),
        "images": _stored_json(images, dek),
        "tool_events": _stored_json(tool_events, dek),
        "files": _stored_json(files, dek),
        "created_at": time.time(),
    }
    with _connect() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, sources,"
            " images, tool_events, files, created_at) VALUES (:id,"
            " :conversation_id, :role, :content, :sources, :images,"
            " :tool_events, :files, :created_at)",
            msg,
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (msg["created_at"], conv_id),
        )
    msg["content"] = content
    msg["sources"] = sources
    msg["images"] = images
    msg["tool_events"] = tool_events
    msg["files"] = files
    return msg


# ---------- Users & sessions ----------

def count_users() -> int:
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]


def create_user(username: str, password_salt: str, password_hash: str,
                is_admin: bool = False,
                must_change_password: bool = False) -> dict:
    user = {
        "id": uuid.uuid4().hex,
        "username": username,
        "password_salt": password_salt,
        "password_hash": password_hash,
        "is_admin": int(is_admin),
        "must_change_password": int(must_change_password),
        "created_at": time.time(),
    }
    with _connect() as conn:
        conn.execute(
            "INSERT INTO users (id, username, password_salt, password_hash,"
            " is_admin, must_change_password, created_at) VALUES (:id,"
            " :username, :password_salt, :password_hash, :is_admin,"
            " :must_change_password, :created_at)",
            user,
        )
    return user


def get_user(user_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_username(username: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    return dict(row) if row else None


def list_users() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM users ORDER BY created_at"
        ).fetchall()
    return [dict(r) for r in rows]


def set_user_password(user_id: str, password_salt: str, password_hash: str,
                      must_change_password: bool) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET password_salt = ?, password_hash = ?,"
            " must_change_password = ? WHERE id = ?",
            (password_salt, password_hash, int(must_change_password),
             user_id),
        )


def set_user_keys(user_id: str, enc_salt: str, wrapped_dek: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET enc_salt = ?, wrapped_dek = ? WHERE id = ?",
            (enc_salt, wrapped_dek, user_id),
        )


def encrypt_existing_history(user_id: str, dek: bytes) -> int:
    """One-time migration: encrypt a user's plaintext conversations
    (history from before encryption existed). Returns rows touched."""
    touched = 0
    with _connect() as conn:
        convs = conn.execute(
            "SELECT id, title FROM conversations WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        for conv in convs:
            if not crypto.is_encrypted(conv["title"]):
                conn.execute(
                    "UPDATE conversations SET title = ? WHERE id = ?",
                    (crypto.encrypt_text(dek, conv["title"]), conv["id"]),
                )
                touched += 1
            msgs = conn.execute(
                "SELECT id, content, sources, images, tool_events, files"
                " FROM messages WHERE conversation_id = ?",
                (conv["id"],),
            ).fetchall()
            for m in msgs:
                if crypto.is_encrypted(m["content"]):
                    continue
                enc = lambda v: crypto.encrypt_text(dek, v) if v else None
                conn.execute(
                    "UPDATE messages SET content = ?, sources = ?,"
                    " images = ?, tool_events = ?, files = ? WHERE id = ?",
                    (crypto.encrypt_text(dek, m["content"]),
                     enc(m["sources"]), enc(m["images"]),
                     enc(m["tool_events"]), enc(m["files"]), m["id"]),
                )
                touched += 1
    return touched


def delete_user_conversations(user_id: str) -> None:
    with _connect() as conn:
        conn.execute(
            "DELETE FROM messages WHERE conversation_id IN"
            " (SELECT id FROM conversations WHERE user_id = ?)",
            (user_id,),
        )
        conn.execute("DELETE FROM conversations WHERE user_id = ?",
                     (user_id,))


def clear_all_sessions() -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions")


def set_user_avatar(user_id: str, avatar: str | None) -> None:
    with _connect() as conn:
        conn.execute("UPDATE users SET avatar = ? WHERE id = ?",
                     (avatar, user_id))


def delete_user(user_id: str) -> None:
    with _connect() as conn:
        # Their sessions cascade; their conversations (and messages) go too.
        conn.execute(
            "DELETE FROM messages WHERE conversation_id IN"
            " (SELECT id FROM conversations WHERE user_id = ?)",
            (user_id,),
        )
        conn.execute("DELETE FROM conversations WHERE user_id = ?",
                     (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def create_session(token: str, user_id: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at)"
            " VALUES (?, ?, ?)",
            (token, user_id, time.time()),
        )


def get_session_user(token: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token = ?",
            (token,),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def delete_user_sessions(user_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
