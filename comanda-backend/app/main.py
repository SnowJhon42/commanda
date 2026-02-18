from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import admin, auth, events, menu, orders, staff
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


def _ensure_runtime_schema_migrations() -> None:
    # Lightweight runtime migration for local SQLite MVP.
    with engine.begin() as conn:
        orders_sql_row = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'")
        ).fetchone()
        orders_sql = (orders_sql_row[0] if orders_sql_row else "") or ""
        if "status_aggregated IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'DELIVERED')" in orders_sql:
            conn.execute(text("PRAGMA foreign_keys = OFF"))
            conn.execute(
                text(
                    """
                    CREATE TABLE orders_new (
                      id INTEGER PRIMARY KEY,
                      tenant_id INTEGER NOT NULL,
                      store_id INTEGER NOT NULL,
                      table_id INTEGER NOT NULL,
                      guest_count INTEGER NOT NULL CHECK (guest_count > 0),
                      ticket_number INTEGER NOT NULL,
                      status_aggregated TEXT NOT NULL CHECK (status_aggregated IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'PARCIAL', 'DELIVERED')),
                      created_at DATETIME NOT NULL,
                      updated_at DATETIME NOT NULL,
                      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
                      FOREIGN KEY(store_id) REFERENCES stores(id),
                      FOREIGN KEY(table_id) REFERENCES tables(id),
                      CONSTRAINT uq_orders_store_ticket UNIQUE (store_id, ticket_number)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO orders_new (id, tenant_id, store_id, table_id, guest_count, ticket_number, status_aggregated, created_at, updated_at)
                    SELECT id, tenant_id, store_id, table_id, guest_count, ticket_number, status_aggregated, created_at, updated_at
                    FROM orders
                    """
                )
            )
            conn.execute(text("DROP TABLE orders"))
            conn.execute(text("ALTER TABLE orders_new RENAME TO orders"))
            conn.execute(text("PRAGMA foreign_keys = ON"))

        columns = conn.execute(text("PRAGMA table_info(order_items)")).fetchall()
        column_names = {row[1] for row in columns}
        if "status" not in column_names:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN status TEXT NOT NULL DEFAULT 'RECEIVED'"))
        if "updated_at" not in column_names:
            conn.execute(text("ALTER TABLE order_items ADD COLUMN updated_at DATETIME NULL"))
            conn.execute(
                text(
                    "UPDATE order_items SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)"
                )
            )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS item_status_events (
                  id INTEGER PRIMARY KEY,
                  item_id INTEGER NOT NULL,
                  order_id INTEGER NOT NULL,
                  sector TEXT NOT NULL,
                  from_status TEXT NULL,
                  to_status TEXT NOT NULL,
                  changed_by_staff_id INTEGER NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(item_id) REFERENCES order_items(id),
                  FOREIGN KEY(order_id) REFERENCES orders(id),
                  FOREIGN KEY(changed_by_staff_id) REFERENCES staff_accounts(id)
                )
                """
            )
        )


@app.on_event("startup")
def on_startup() -> None:
    _ensure_runtime_schema_migrations()
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(staff.router)
app.include_router(admin.router)
app.include_router(events.router)
