"""Per-user at-rest encryption for chat history.

Envelope scheme: each user has a random 32-byte data key (DEK) that
encrypts their messages and titles (AES-256-GCM). The DEK is stored only
wrapped by a key derived from the user's password (PBKDF2), so the server
cannot decrypt a user's history without their password. Password changes
rewrap the DEK; an admin reset cannot recover it.
"""

import base64
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KDF_ITERATIONS = 200_000
PREFIX = "enc:v1:"


def derive_kek(password: str, salt_hex: str) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), KDF_ITERATIONS
    )


def new_dek() -> bytes:
    return os.urandom(32)


def new_salt() -> str:
    return os.urandom(16).hex()


def wrap_dek(kek: bytes, dek: bytes) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(kek).encrypt(nonce, dek, None)
    return base64.b64encode(nonce + ct).decode()


def unwrap_dek(kek: bytes, wrapped: str) -> bytes | None:
    """Return the DEK, or None if the password-derived key is wrong."""
    try:
        raw = base64.b64decode(wrapped)
        return AESGCM(kek).decrypt(raw[:12], raw[12:], None)
    except (InvalidTag, ValueError):
        return None


def encrypt_text(dek: bytes, text: str) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(dek).encrypt(nonce, text.encode(), None)
    return PREFIX + base64.b64encode(nonce + ct).decode()


def decrypt_text(dek: bytes | None, stored: str) -> str:
    """Decrypt if encrypted; pass plaintext (anonymous chats) through."""
    if not stored or not stored.startswith(PREFIX):
        return stored
    if dek is None:
        return "[encrypted]"
    try:
        raw = base64.b64decode(stored[len(PREFIX):])
        return AESGCM(dek).decrypt(raw[:12], raw[12:], None).decode()
    except (InvalidTag, ValueError):
        return "[unable to decrypt]"


def is_encrypted(stored: str) -> bool:
    return bool(stored) and stored.startswith(PREFIX)
