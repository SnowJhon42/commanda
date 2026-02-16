from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_pin
from app.db.models import StaffAccount
from app.db.session import get_db
from app.schemas.auth import LoginResponse, SectorLoginRequest, StaffInfo

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sector-login", response_model=LoginResponse)
def sector_login(payload: SectorLoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    staff = db.scalar(
        select(StaffAccount).where(
            StaffAccount.store_id == payload.store_id,
            StaffAccount.username == payload.username,
            StaffAccount.active == True,
        )
    )
    if not staff or not verify_pin(payload.pin, staff.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(
        {"staff_id": staff.id, "store_id": staff.store_id, "sector": staff.sector, "username": staff.username}
    )
    return LoginResponse(
        access_token=token,
        staff=StaffInfo(id=staff.id, store_id=staff.store_id, sector=staff.sector, username=staff.username),
    )
