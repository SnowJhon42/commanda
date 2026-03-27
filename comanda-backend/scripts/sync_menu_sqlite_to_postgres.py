import os
import sqlite3
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings


def require_sqlite_path() -> Path:
    raw = os.getenv("LOCAL_SQLITE_PATH")
    if not raw:
        raise RuntimeError("LOCAL_SQLITE_PATH is required")
    path = Path(raw).resolve()
    if not path.exists():
        raise RuntimeError(f"SQLite file not found: {path}")
    return path


def fetch_rows(sqlite_path: Path, query: str) -> list[sqlite3.Row]:
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        cur.execute(query)
        return cur.fetchall()
    finally:
        conn.close()


def to_payload(row: sqlite3.Row, bool_fields: set[str]) -> dict:
    payload = dict(row)
    for field in bool_fields:
        if field in payload and payload[field] is not None:
            payload[field] = bool(payload[field])
    return payload


def sync_categories(sqlite_path: Path, pg_engine) -> None:
    rows = fetch_rows(
        sqlite_path,
        """
        SELECT id, store_id, name, image_url, sort_order, active, created_at
        FROM menu_categories
        ORDER BY id
        """,
    )
    with pg_engine.begin() as conn:
        for row in rows:
            conn.execute(
                text(
                    """
                    INSERT INTO menu_categories (
                        id, store_id, name, image_url, sort_order, active, created_at
                    ) VALUES (
                        :id, :store_id, :name, :image_url, :sort_order, :active, :created_at
                    )
                    ON CONFLICT (id) DO UPDATE
                    SET store_id = EXCLUDED.store_id,
                        name = EXCLUDED.name,
                        image_url = EXCLUDED.image_url,
                        sort_order = EXCLUDED.sort_order,
                        active = EXCLUDED.active,
                        created_at = EXCLUDED.created_at
                    """
                ),
                to_payload(row, {"active"}),
            )


def sync_products(sqlite_path: Path, pg_engine) -> None:
    rows = fetch_rows(
        sqlite_path,
        """
        SELECT id, store_id, category_id, name, image_url, description, base_price,
               fulfillment_sector, active, created_at
        FROM products
        ORDER BY id
        """,
    )
    with pg_engine.begin() as conn:
        for row in rows:
            conn.execute(
                text(
                    """
                    INSERT INTO products (
                        id, store_id, category_id, name, image_url, description, base_price,
                        fulfillment_sector, active, created_at
                    ) VALUES (
                        :id, :store_id, :category_id, :name, :image_url, :description, :base_price,
                        :fulfillment_sector, :active, :created_at
                    )
                    ON CONFLICT (id) DO UPDATE
                    SET store_id = EXCLUDED.store_id,
                        category_id = EXCLUDED.category_id,
                        name = EXCLUDED.name,
                        image_url = EXCLUDED.image_url,
                        description = EXCLUDED.description,
                        base_price = EXCLUDED.base_price,
                        fulfillment_sector = EXCLUDED.fulfillment_sector,
                        active = EXCLUDED.active,
                        created_at = EXCLUDED.created_at
                    """
                ),
                to_payload(row, {"active"}),
            )


def sync_variants(sqlite_path: Path, pg_engine) -> None:
    rows = fetch_rows(
        sqlite_path,
        """
        SELECT id, product_id, name, extra_price, active, created_at
        FROM product_variants
        ORDER BY id
        """,
    )
    with pg_engine.begin() as conn:
        for row in rows:
            conn.execute(
                text(
                    """
                    INSERT INTO product_variants (
                        id, product_id, name, extra_price, active, created_at
                    ) VALUES (
                        :id, :product_id, :name, :extra_price, :active, :created_at
                    )
                    ON CONFLICT (id) DO UPDATE
                    SET product_id = EXCLUDED.product_id,
                        name = EXCLUDED.name,
                        extra_price = EXCLUDED.extra_price,
                        active = EXCLUDED.active,
                        created_at = EXCLUDED.created_at
                    """
                ),
                to_payload(row, {"active"}),
            )


def sync_sequences(pg_engine) -> None:
    sequence_targets = [
        ("menu_categories", "id"),
        ("products", "id"),
        ("product_variants", "id"),
    ]
    with pg_engine.begin() as conn:
        for table_name, column_name in sequence_targets:
            conn.execute(
                text(
                    """
                    SELECT setval(
                        pg_get_serial_sequence(:table_name, :column_name),
                        COALESCE((SELECT MAX(id) FROM """ + table_name + """), 1),
                        TRUE
                    )
                    """
                ),
                {"table_name": table_name, "column_name": column_name},
            )


if __name__ == "__main__":
    sqlite_path = require_sqlite_path()
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("DATABASE_URL must point to PostgreSQL")

    engine = create_engine(settings.database_url)
    sync_categories(sqlite_path, engine)
    sync_products(sqlite_path, engine)
    sync_variants(sqlite_path, engine)
    sync_sequences(engine)
    print("Menu data synced from SQLite to PostgreSQL")
