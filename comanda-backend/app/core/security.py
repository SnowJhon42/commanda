from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_pin(plain_pin: str, pin_hash: str) -> bool:
    # Seed placeholder for quick MVP bootstrap.
    if pin_hash.startswith("CHANGE_ME_HASH_"):
        return plain_pin == "1234"
    return pwd_context.verify(plain_pin, pin_hash)


def hash_pin(pin: str) -> str:
    return pwd_context.hash(pin)


def create_access_token(subject: dict[str, Any]) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {**subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
