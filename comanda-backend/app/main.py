from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, menu, orders, staff
from app.core.config import settings
from app.db.base import Base
from app.db.models import entities as _entities  # noqa: F401
from app.db.session import engine

app = FastAPI(title=settings.app_name)

# Defaults cover local Vite ports; can be overridden with CORS_ALLOW_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(staff.router)
app.include_router(admin.router)
