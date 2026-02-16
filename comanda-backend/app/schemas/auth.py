from pydantic import BaseModel


class SectorLoginRequest(BaseModel):
    store_id: int
    username: str
    pin: str


class StaffInfo(BaseModel):
    id: int
    store_id: int
    sector: str
    username: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    staff: StaffInfo
