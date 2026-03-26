from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection


def _table_columns(conn: Connection, table_name: str) -> set[str]:
    inspector = inspect(conn)
    return {str(column["name"]) for column in inspector.get_columns(table_name)}


def _existing_tables(conn: Connection) -> set[str]:
    inspector = inspect(conn)
    return set(inspector.get_table_names())


def apply_sqlite_schema_bootstrap(conn: Connection) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS table_sessions (
              id INTEGER PRIMARY KEY,
              store_id INTEGER NOT NULL,
              table_id INTEGER NOT NULL,
              guest_count INTEGER NOT NULL DEFAULT 1,
              status TEXT NOT NULL DEFAULT 'MESA_OCUPADA',
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
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS table_session_cash_requests (
              id INTEGER PRIMARY KEY,
              table_session_id INTEGER NOT NULL,
              order_id INTEGER NULL,
              store_id INTEGER NOT NULL,
              client_id TEXT NOT NULL,
              payer_label TEXT NOT NULL,
              request_kind TEXT NOT NULL DEFAULT 'CASH_PAYMENT',
              note TEXT NULL,
              status TEXT NOT NULL DEFAULT 'PENDING',
              resolved_by_staff_id INTEGER NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              resolved_at DATETIME NULL,
              FOREIGN KEY(table_session_id) REFERENCES table_sessions(id),
              FOREIGN KEY(order_id) REFERENCES orders(id),
              FOREIGN KEY(store_id) REFERENCES stores(id),
              FOREIGN KEY(resolved_by_staff_id) REFERENCES staff_accounts(id)
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS product_extra_options (
              id INTEGER PRIMARY KEY,
              product_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              extra_price NUMERIC(10,2) NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(product_id) REFERENCES products(id)
            )
            """
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

    orders_sql_row = conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'")).fetchone()
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

    order_column_names = _table_columns(conn, "orders")
    if "table_session_id" not in order_column_names:
        conn.execute(text("ALTER TABLE orders ADD COLUMN table_session_id INTEGER NULL"))
    if "printed_full_at" not in order_column_names:
        conn.execute(text("ALTER TABLE orders ADD COLUMN printed_full_at DATETIME NULL"))
    if "printed_kitchen_at" not in order_column_names:
        conn.execute(text("ALTER TABLE orders ADD COLUMN printed_kitchen_at DATETIME NULL"))
    if "printed_bar_at" not in order_column_names:
        conn.execute(text("ALTER TABLE orders ADD COLUMN printed_bar_at DATETIME NULL"))
    if "printed_waiter_at" not in order_column_names:
        conn.execute(text("ALTER TABLE orders ADD COLUMN printed_waiter_at DATETIME NULL"))

    order_item_column_names = _table_columns(conn, "order_items")
    if "status" not in order_item_column_names:
        conn.execute(text("ALTER TABLE order_items ADD COLUMN status TEXT NOT NULL DEFAULT 'RECEIVED'"))
    if "created_by_client_id" not in order_item_column_names:
        conn.execute(text("ALTER TABLE order_items ADD COLUMN created_by_client_id TEXT NULL"))
    if "updated_at" not in order_item_column_names:
        conn.execute(text("ALTER TABLE order_items ADD COLUMN updated_at DATETIME NULL"))
        conn.execute(text("UPDATE order_items SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)"))

    category_column_names = _table_columns(conn, "menu_categories")
    if "image_url" not in category_column_names:
        conn.execute(text("ALTER TABLE menu_categories ADD COLUMN image_url TEXT NULL"))

    store_column_names = _table_columns(conn, "stores")
    if "show_live_total_to_client" not in store_column_names:
        conn.execute(text("ALTER TABLE stores ADD COLUMN show_live_total_to_client INTEGER NOT NULL DEFAULT 1"))
    if "print_mode" not in store_column_names:
        conn.execute(text("ALTER TABLE stores ADD COLUMN print_mode TEXT NOT NULL DEFAULT 'MANUAL'"))

    table_session_column_names = _table_columns(conn, "table_sessions")
    if "guest_count" not in table_session_column_names:
        conn.execute(text("ALTER TABLE table_sessions ADD COLUMN guest_count INTEGER NOT NULL DEFAULT 1"))

    cash_request_column_names = _table_columns(conn, "table_session_cash_requests")
    if "request_kind" not in cash_request_column_names:
        conn.execute(
            text("ALTER TABLE table_session_cash_requests ADD COLUMN request_kind TEXT NOT NULL DEFAULT 'CASH_PAYMENT'")
        )

    product_column_names = _table_columns(conn, "products")
    if "image_url" not in product_column_names:
        conn.execute(text("ALTER TABLE products ADD COLUMN image_url TEXT NULL"))

    conn.execute(text("UPDATE table_sessions SET guest_count = COALESCE(NULLIF(guest_count, 0), 1)"))
    conn.execute(text("UPDATE table_sessions SET status = 'MESA_OCUPADA' WHERE status = 'OPEN'"))


def validate_runtime_schema(conn: Connection) -> list[str]:
    issues: list[str] = []
    required_tables = {
        "tenants",
        "stores",
        "tables",
        "staff_accounts",
        "menu_categories",
        "products",
        "product_variants",
        "orders",
        "order_items",
        "order_sector_status",
        "order_status_events",
        "table_sessions",
        "table_session_clients",
        "bill_splits",
        "bill_split_parts",
        "table_session_feedback",
        "table_session_cash_requests",
        "product_extra_options",
        "item_status_events",
    }
    existing_tables = _existing_tables(conn)
    for table_name in sorted(required_tables - existing_tables):
        issues.append(f"missing table: {table_name}")

    if "orders" in existing_tables:
        missing = {"table_session_id", "printed_full_at", "printed_kitchen_at", "printed_bar_at", "printed_waiter_at"} - _table_columns(conn, "orders")
        for column in sorted(missing):
            issues.append(f"orders missing column: {column}")

    if "order_items" in existing_tables:
        missing = {"status", "created_by_client_id", "updated_at"} - _table_columns(conn, "order_items")
        for column in sorted(missing):
            issues.append(f"order_items missing column: {column}")

    if "stores" in existing_tables:
        missing = {"show_live_total_to_client", "print_mode"} - _table_columns(conn, "stores")
        for column in sorted(missing):
            issues.append(f"stores missing column: {column}")

    if "products" in existing_tables:
        missing = {"image_url"} - _table_columns(conn, "products")
        for column in sorted(missing):
            issues.append(f"products missing column: {column}")

    if "menu_categories" in existing_tables:
        missing = {"image_url"} - _table_columns(conn, "menu_categories")
        for column in sorted(missing):
            issues.append(f"menu_categories missing column: {column}")

    return issues
