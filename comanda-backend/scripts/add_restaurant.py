import sqlite3
import sys
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.core.security import hash_pin


@dataclass(frozen=True)
class CategorySeed:
    name: str
    image_url: str
    sort_order: int


@dataclass(frozen=True)
class ProductSeed:
    category_name: str
    name: str
    image_url: str
    description: str
    base_price: Decimal
    fulfillment_sector: str


RESTAURANT_NAME = "Bar AgraRABAS"
STORE_NAME = "Bar AgraRABAS Centro"
DEFAULT_PIN = "1234"
DEFAULT_OWNER_PASSWORD = "1234"
TABLE_CODES = [f"M{i}" for i in range(1, 13)]
STAFF_USERS = (
    ("ADMIN", "admin_agrarabas"),
    ("KITCHEN", "cocina_agrarabas"),
    ("BAR", "barra_agrarabas"),
    ("WAITER", "mozo_agrarabas"),
)

CATEGORIES = (
    CategorySeed(
        name="Tragos Caribe",
        image_url="https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80",
        sort_order=10,
    ),
    CategorySeed(
        name="Dips de la Casa",
        image_url="https://images.unsplash.com/photo-1546549032-9571cd6b27df?auto=format&fit=crop&w=900&q=80",
        sort_order=20,
    ),
)

PRODUCTS = (
    ProductSeed(
        category_name="Tragos Caribe",
        name="Mai Tai Barranca",
        image_url="https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=80",
        description="Ron oscuro, curacao, lima fresca y almendra. Tiki, profundo y seco.",
        base_price=Decimal("9800"),
        fulfillment_sector="BAR",
    ),
    ProductSeed(
        category_name="Tragos Caribe",
        name="Piña Brava Colada",
        image_url="https://images.unsplash.com/photo-1551024709-8f23befc6cf7?auto=format&fit=crop&w=900&q=80",
        description="Ron blanco, coco, anana natural y nuez moscada. Cremoso y filoso.",
        base_price=Decimal("10200"),
        fulfillment_sector="BAR",
    ),
    ProductSeed(
        category_name="Tragos Caribe",
        name="Daiquiri Maracuya Salvaje",
        image_url="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80",
        description="Ron, maracuya, lima y un final citrico agresivo.",
        base_price=Decimal("9400"),
        fulfillment_sector="BAR",
    ),
    ProductSeed(
        category_name="Tragos Caribe",
        name="Zombie de la Marea",
        image_url="https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=900&q=80",
        description="Blend de rones, pomelo, canela y absenta. Potente, no diplomático.",
        base_price=Decimal("11800"),
        fulfillment_sector="BAR",
    ),
    ProductSeed(
        category_name="Tragos Caribe",
        name="Mojito de Coco Quemado",
        image_url="https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80",
        description="Ron, menta, lima y coco tostado. Fresco con humo suave.",
        base_price=Decimal("9300"),
        fulfillment_sector="BAR",
    ),
    ProductSeed(
        category_name="Dips de la Casa",
        name="Trio Furia Tropical",
        image_url="https://images.unsplash.com/photo-1546549032-9571cd6b27df?auto=format&fit=crop&w=900&q=80",
        description="Guacamole picante, hummus de mango y crema de aji amarillo con chips crujientes.",
        base_price=Decimal("12500"),
        fulfillment_sector="KITCHEN",
    ),
    ProductSeed(
        category_name="Dips de la Casa",
        name="Cangrejo Calipso",
        image_url="https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=80",
        description="Dip tibio de cangrejo, queso suave, lima y chile dulce. Sale con tostadas especiadas.",
        base_price=Decimal("13900"),
        fulfillment_sector="KITCHEN",
    ),
    ProductSeed(
        category_name="Dips de la Casa",
        name="Berenjena Negroni",
        image_url="https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=900&q=80",
        description="Berenjena ahumada, yogur, hierbas frescas y aceite de naranja amarga.",
        base_price=Decimal("11200"),
        fulfillment_sector="KITCHEN",
    ),
)


def database_file_from_url(url: str) -> Path:
    if not url.startswith("sqlite:///"):
        raise RuntimeError("add_restaurant.py currently supports only sqlite:/// URLs")
    return Path(url.replace("sqlite:///", "", 1)).resolve()


def ensure_tenant(conn: sqlite3.Connection, name: str) -> int:
    row = conn.execute("SELECT id FROM tenants WHERE name = ?", (name,)).fetchone()
    if row:
        return int(row[0])
    cursor = conn.execute("INSERT INTO tenants (name) VALUES (?)", (name,))
    return int(cursor.lastrowid)


def ensure_store(conn: sqlite3.Connection, tenant_id: int, store_name: str, owner_password: str) -> int:
    owner_password_hash = hash_pin(owner_password)
    row = conn.execute(
        "SELECT id FROM stores WHERE tenant_id = ? AND name = ?",
        (tenant_id, store_name),
    ).fetchone()
    if row:
        store_id = int(row[0])
        conn.execute(
            "UPDATE stores SET owner_password_hash = COALESCE(owner_password_hash, ?) WHERE id = ?",
            (owner_password_hash, store_id),
        )
        return store_id
    cursor = conn.execute(
        """
        INSERT INTO stores (tenant_id, name, show_live_total_to_client, print_mode, whatsapp_share_template, owner_password_hash)
        VALUES (?, ?, 1, 'MANUAL', NULL, ?)
        """,
        (tenant_id, store_name, owner_password_hash),
    )
    return int(cursor.lastrowid)


def ensure_tables(conn: sqlite3.Connection, store_id: int, table_codes: list[str]) -> int:
    created = 0
    for code in table_codes:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO tables (store_id, code, active) VALUES (?, ?, 1)",
            (store_id, code),
        )
        if cursor.rowcount:
            created += 1
    return created


def ensure_staff(conn: sqlite3.Connection, store_id: int) -> int:
    created = 0
    pin_hash = hash_pin(DEFAULT_PIN)
    for sector, username in STAFF_USERS:
        row = conn.execute(
            "SELECT id FROM staff_accounts WHERE store_id = ? AND username = ?",
            (store_id, username),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE staff_accounts
                SET sector = ?, active = 1
                WHERE id = ?
                """,
                (sector, int(row[0])),
            )
            continue
        cursor = conn.execute(
            """
            INSERT INTO staff_accounts (store_id, sector, username, pin_hash, active)
            VALUES (?, ?, ?, ?, 1)
            """,
            (store_id, sector, username, pin_hash),
        )
        if cursor.rowcount:
            created += 1
    return created


def ensure_categories(conn: sqlite3.Connection, store_id: int) -> dict[str, int]:
    category_ids: dict[str, int] = {}
    for category in CATEGORIES:
        row = conn.execute(
            "SELECT id FROM menu_categories WHERE store_id = ? AND name = ?",
            (store_id, category.name),
        ).fetchone()
        if row:
            category_id = int(row[0])
            conn.execute(
                """
                UPDATE menu_categories
                SET image_url = ?, sort_order = ?, active = 1
                WHERE id = ?
                """,
                (category.image_url, category.sort_order, category_id),
            )
        else:
            cursor = conn.execute(
                """
                INSERT INTO menu_categories (store_id, name, image_url, sort_order, active)
                VALUES (?, ?, ?, ?, 1)
                """,
                (store_id, category.name, category.image_url, category.sort_order),
            )
            category_id = int(cursor.lastrowid)
        category_ids[category.name] = category_id
    return category_ids


def ensure_products(conn: sqlite3.Connection, store_id: int, category_ids: dict[str, int]) -> int:
    created = 0
    for product in PRODUCTS:
        row = conn.execute(
            "SELECT id FROM products WHERE store_id = ? AND name = ?",
            (store_id, product.name),
        ).fetchone()
        params = (
            category_ids[product.category_name],
            product.image_url,
            product.description,
            str(product.base_price),
            product.fulfillment_sector,
            store_id,
            product.name,
        )
        if row:
            conn.execute(
                """
                UPDATE products
                SET category_id = ?, image_url = ?, description = ?, base_price = ?, fulfillment_sector = ?, active = 1
                WHERE store_id = ? AND name = ?
                """,
                params,
            )
            continue
        cursor = conn.execute(
            """
            INSERT INTO products (store_id, category_id, name, image_url, description, base_price, fulfillment_sector, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                store_id,
                category_ids[product.category_name],
                product.name,
                product.image_url,
                product.description,
                str(product.base_price),
                product.fulfillment_sector,
            ),
        )
        if cursor.rowcount:
            created += 1
    return created


if __name__ == "__main__":
    db_file = database_file_from_url(settings.database_url)
    if not db_file.exists():
        raise FileNotFoundError(f"Database file not found: {db_file}. Run `python scripts/init_db.py` first.")

    with sqlite3.connect(str(db_file)) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        tenant_id = ensure_tenant(conn, RESTAURANT_NAME)
        store_id = ensure_store(conn, tenant_id, STORE_NAME, DEFAULT_OWNER_PASSWORD)
        tables_created = ensure_tables(conn, store_id, TABLE_CODES)
        staff_created = ensure_staff(conn, store_id)
        category_ids = ensure_categories(conn, store_id)
        products_created = ensure_products(conn, store_id, category_ids)
        conn.commit()

    print(f"restaurant={RESTAURANT_NAME}")
    print(f"tenant_id={tenant_id}")
    print(f"store={STORE_NAME}")
    print(f"store_id={store_id}")
    print(f"tables_created={tables_created}")
    print(f"staff_created={staff_created}")
    print(f"products_created={products_created}")
    print("staff_pin=1234")
    print("owner_password=1234")
