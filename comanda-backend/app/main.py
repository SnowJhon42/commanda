from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, auth, billing, events, menu, orders, staff, table_sessions
from app.core.config import settings
from app.db.models import entities as _entities  # noqa: F401
from app.db.runtime_schema import validate_runtime_schema
from app.db.session import engine

app = FastAPI(title=settings.app_name)

# Defaults cover local Vite ports; can be overridden with CORS_ALLOW_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup() -> None:
    with engine.begin() as conn:
        issues = validate_runtime_schema(conn)
    if issues:
        joined = "; ".join(issues)
        raise RuntimeError(f"Database schema is outdated. Run `python scripts/init_db.py`. Details: {joined}")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(staff.router)
app.include_router(admin.router)
app.include_router(events.router)
app.include_router(table_sessions.router)
app.include_router(billing.router)
