"""Password hashing and temp-password generation (stdlib only)."""

import hashlib
import hmac
import secrets

ITERATIONS = 200_000


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Return (salt_hex, digest_hex) for the given password."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), ITERATIONS
    ).hex()
    return salt, digest


def verify_password(password: str, salt: str, digest: str) -> bool:
    _, calc = hash_password(password, salt)
    return hmac.compare_digest(calc, digest)


def generate_temp_password() -> str:
    """Short, readable one-time password the admin hands to the user."""
    return secrets.token_urlsafe(8)


def generate_session_token() -> str:
    return secrets.token_hex(32)
