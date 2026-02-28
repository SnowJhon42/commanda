from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import admin, auth, billing, events, menu, orders, staff, table_sessions
from app.core.config import settings
from app.db.base import Base
from app.db.models import entities as _entities  # noqa: F401
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


def _ensure_runtime_schema_migrations() -> None:
    # Lightweight runtime migration for local SQLite MVP.
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS table_sessions (
                  id INTEGER PRIMARY KEY,
                  store_id INTEGER NOT NULL,
                  table_id INTEGER NOT NULL,
                  status TEXT NOT NULL DEFAULT 'OPEN',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  closed_at DATETIME NULL,
                  FOREIGN KEY(store_id) REFERENCES stores(id),
                  FOREIGN KEY(table_id) REFERENCES tables(id)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS table_session_clients (
                  id INTEGER PRIMARY KEY,
                  table_session_id INTEGER NOT NULL,
                  client_id TEXT NOT NULL,
                  alias TEXT NULL,
                  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(table_session_id) REFERENCES table_sessions(id),
                  CONSTRAINT uq_table_session_client UNIQUE (table_session_id, client_id)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bill_splits (
                  id INTEGER PRIMARY KEY,
                  order_id INTEGER NOT NULL,
                  mode TEXT NOT NULL DEFAULT 'EQUAL',
                  status TEXT NOT NULL DEFAULT 'OPEN',
                  total_amount NUMERIC(10,2) NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  closed_at DATETIME NULL,
                  FOREIGN KEY(order_id) REFERENCES orders(id)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bill_split_parts (
                  id INTEGER PRIMARY KEY,
                  bill_split_id INTEGER NOT NULL,
                  label TEXT NOT NULL,
                  amount NUMERIC(10,2) NOT NULL,
                  payment_status TEXT NOT NULL DEFAULT 'PENDING',
                  reported_by TEXT NULL,
                  reported_at DATETIME NULL,
                  confirmed_by_staff_id INTEGER NULL,
                  confirmed_at DATETIME NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(bill_split_id) REFERENCES bill_splits(id),
                  FOREIGN KEY(confirmed_by_staff_id) REFERENCES staff_accounts(id)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS table_session_feedback (
                  id INTEGER PRIMARY KEY,
                  table_session_id INTEGER NOT NULL,
                  store_id INTEGER NOT NULL,
                  client_id TEXT NOT NULL,
                  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                  comment TEXT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(table_session_id) REFERENCES table_sessions(id),
                  FOREIGN KEY(store_id) REFERENCES stores(id),
                  CONSTRAINT uq_table_session_feedback_client UNIQUE (table_session_id, client_id)
                )
                """
            )
        )

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
                      table_session_id INTEGER NULL,
                      guest_count INTEGER NOT NULL CHECK (guest_count > 0),
                      ticket_number INTEGER NOT NULL,
                      status_aggregated TEXT NOT NULL CHECK (status_aggregated IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'PARCIAL', 'DELIVERED')),
                      created_at DATETIME NOT NULL,
                      updated_at DATETIME NOT NULL,
                      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
                      FOREIGN KEY(store_id) REFERENCES stores(id),
                      FOREIGN KEY(table_id) REFERENCES tables(id),
                      FOREIGN KEY(table_session_id) REFERENCES table_sessions(id),
                      CONSTRAINT uq_orders_store_ticket UNIQUE (store_id, ticket_number)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO orders_new (id, tenant_id, store_id, table_id, table_session_id, guest_count, ticket_number, status_aggregated, created_at, updated_at)
                    SELECT id, tenant_id, store_id, table_id, NULL AS table_session_id, guest_count, ticket_number, status_aggregated, created_at, updated_at
                    FROM orders
                    """
                )
            )
            conn.execute(text("DROP TABLE orders"))
            conn.execute(text("ALTER TABLE orders_new RENAME TO orders"))
            conn.execute(text("PRAGMA foreign_keys = ON"))
        else:
            order_columns = conn.execute(text("PRAGMA table_info(orders)")).fetchall()
            order_column_names = {row[1] for row in order_columns}
            if "table_session_id" not in order_column_names:
                conn.execute(text("ALTER TABLE orders ADD COLUMN table_session_id INTEGER NULL"))

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

        category_columns = conn.execute(text("PRAGMA table_info(menu_categories)")).fetchall()
        category_column_names = {row[1] for row in category_columns}
        if "image_url" not in category_column_names:
            conn.execute(text("ALTER TABLE menu_categories ADD COLUMN image_url TEXT NULL"))

        product_columns = conn.execute(text("PRAGMA table_info(products)")).fetchall()
        product_column_names = {row[1] for row in product_columns}
        if "image_url" not in product_column_names:
            conn.execute(text("ALTER TABLE products ADD COLUMN image_url TEXT NULL"))


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
app.include_router(table_sessions.router)
app.include_router(billing.router)
