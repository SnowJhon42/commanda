from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Sector, StaffAccount
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/sector-login")


def get_current_staff(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> StaffAccount:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        staff_id = payload.get("staff_id")
        if staff_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    staff = db.scalar(select(StaffAccount).where(StaffAccount.id == staff_id, StaffAccount.active == True))
    if not staff:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff not found")
    return staff


@dataclass
class TableClientContext:
    table_session_id: int
    store_id: int
    client_id: str


def get_current_table_client(
    table_session_token: str | None = Header(default=None, alias="X-Table-Session-Token"),
    table_session_token_query: str | None = Query(default=None, alias="session_token"),
) -> TableClientContext:
    token = table_session_token or table_session_token_query
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing table session token")

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("kind") != "table_client":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid table session token")
        table_session_id = int(payload.get("table_session_id") or 0)
        store_id = int(payload.get("store_id") or 0)
        client_id = str(payload.get("client_id") or "").strip()
        if table_session_id <= 0 or store_id <= 0 or not client_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid table session token")
    except (JWTError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid table session token") from exc

    return TableClientContext(table_session_id=table_session_id, store_id=store_id, client_id=client_id)


def ensure_sector_access(current_staff: StaffAccount, requested_sector: str) -> None:
    if current_staff.sector == Sector.ADMIN.value:
        return
    if current_staff.sector != requested_sector:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden sector")
