from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")


def verify_pin(plain_pin: str, pin_hash: str) -> bool:
    if pin_hash.startswith("CHANGE_ME_HASH_"):
        return False
    try:
        return pwd_context.verify(plain_pin, pin_hash)
    except (ValueError, UnknownHashError):
        return False


def hash_pin(pin: str) -> str:
    return pwd_context.hash(pin)


def create_access_token(subject: dict[str, Any]) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {**subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_table_session_token(*, table_session_id: int, store_id: int, client_id: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(hours=12)
    payload = {
        "kind": "table_client",
        "table_session_id": table_session_id,
        "store_id": store_id,
        "client_id": client_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
