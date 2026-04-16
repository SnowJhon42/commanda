import sys
from pathlib import Path

from sqlalchemy import create_engine, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.core.security import hash_pin
from app.db.base import Base
from app.db.models import entities as _entities  # noqa: F401


def seed_minimum_data(engine) -> None:
    hashed_pin = hash_pin("1234")

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO tenants (id, name, created_at)
                VALUES (1, 'Comanda Demo', CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO NOTHING
                """
            )
        )
        conn.execute(
            text(
                """
                    INSERT INTO stores (id, tenant_id, name, show_live_total_to_client, print_mode, created_at)
                    VALUES (1, 1, 'Local Centro', TRUE, 'MANUAL', CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING
                    """
                )
            )
        conn.execute(
            text(
                """
                UPDATE stores
                SET owner_password_hash = :owner_password_hash
                WHERE id = 1 AND owner_password_hash IS NULL
                """
            ),
            {"owner_password_hash": hashed_pin},
        )
        for code in [f"M{i}" for i in range(1, 21)]:
            conn.execute(
                text(
                    """
                    INSERT INTO tables (store_id, code, active, created_at)
                    VALUES (1, :code, TRUE, CURRENT_TIMESTAMP)
                    ON CONFLICT (store_id, code) DO NOTHING
                    """
                ),
                {"code": code},
            )

        for sector, username in [
            ("ADMIN", "admin"),
            ("KITCHEN", "kitchen"),
            ("BAR", "bar"),
            ("WAITER", "waiter"),
        ]:
            conn.execute(
                text(
                    """
                    INSERT INTO staff_accounts (store_id, sector, username, pin_hash, active, created_at)
                    VALUES (1, :sector, :username, :pin_hash, TRUE, CURRENT_TIMESTAMP)
                    ON CONFLICT (store_id, username) DO UPDATE
                    SET sector = EXCLUDED.sector,
                        pin_hash = EXCLUDED.pin_hash,
                        active = TRUE
                    """
                ),
                {"sector": sector, "username": username, "pin_hash": hashed_pin},
            )

        categories = [
            ("Entradas", 1),
            ("Principal", 2),
            ("Postres", 3),
            ("Cervezas", 4),
            ("Tragos", 5),
            ("Vinos", 6),
            ("Sin alcohol", 7),
            ("Sin gluten", 8),
            ("Vegetarianos", 9),
        ]
        for name, sort_order in categories:
            conn.execute(
                text(
                    """
                    INSERT INTO menu_categories (store_id, name, image_url, sort_order, active, created_at)
                    VALUES (1, :name, NULL, :sort_order, TRUE, CURRENT_TIMESTAMP)
                    ON CONFLICT (store_id, name) DO NOTHING
                    """
                ),
                {"name": name, "sort_order": sort_order},
            )

        products = [
            ("Hamburguesa Clasica", "Principal", "Carne, queso, lechuga y tomate", 12000, "KITCHEN"),
            ("Milanesa con Papas", "Principal", "Milanesa vacuna con papas fritas", 14000, "KITCHEN"),
            ("Pizza Muzzarella", "Principal", "Pizza individual", 11000, "KITCHEN"),
            ("Gin Tonic", "Tragos", "Gin con tonica", 9000, "BAR"),
            ("Fernet con Cola", "Tragos", "Vaso largo", 8000, "BAR"),
            ("Mojito", "Tragos", "Ron, lima, menta y soda", 9500, "BAR"),
            ("Agua sin Gas", "Sin alcohol", "Botella 500ml", 3000, "WAITER"),
            ("Agua con Gas", "Sin alcohol", "Botella 500ml", 3000, "WAITER"),
            ("Gaseosa Cola", "Sin alcohol", "Lata 354ml", 3500, "WAITER"),
        ]
        for name, category_name, description, base_price, sector in products:
            conn.execute(
                text(
                    """
                    INSERT INTO products (
                        store_id, category_id, name, image_url, description, base_price, fulfillment_sector, active, created_at
                    )
                    SELECT 1, id, :name, NULL, :description, :base_price, :sector, TRUE, CURRENT_TIMESTAMP
                    FROM menu_categories
                    WHERE store_id = 1 AND name = :category_name
                    AND NOT EXISTS (
                        SELECT 1 FROM products p
                        WHERE p.store_id = 1 AND p.name = :name
                    )
                    """
                ),
                {
                    "name": name,
                    "category_name": category_name,
                    "description": description,
                    "base_price": base_price,
                    "sector": sector,
                },
            )

        variants = [
            ("Hamburguesa Clasica", "Sin cebolla", 0),
            ("Hamburguesa Clasica", "Doble carne", 2500),
            ("Gin Tonic", "Extra limon", 500),
            ("Fernet con Cola", "Sin hielo", 0),
        ]
        for product_name, variant_name, extra_price in variants:
            conn.execute(
                text(
                    """
                    INSERT INTO product_variants (product_id, name, extra_price, active, created_at)
                    SELECT id, :variant_name, :extra_price, TRUE, CURRENT_TIMESTAMP
                    FROM products
                    WHERE name = :product_name
                    AND NOT EXISTS (
                        SELECT 1 FROM product_variants pv
                        WHERE pv.product_id = products.id AND pv.name = :variant_name
                    )
                    """
                ),
                {
                    "product_name": product_name,
                    "variant_name": variant_name,
                    "extra_price": extra_price,
                },
            )


if __name__ == "__main__":
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("init_postgres.py requires a PostgreSQL DATABASE_URL")

    engine = create_engine(settings.database_url)
    Base.metadata.create_all(engine)
    seed_minimum_data(engine)
    print("Postgres database initialized")
