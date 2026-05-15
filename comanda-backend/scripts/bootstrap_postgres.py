from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.core.security import hash_pin
from app.db.base import Base
from app.db.models import MenuCategory, Product, ProductVariant, Sector, StaffAccount, Store, Table, Tenant
from app.db.session import SessionLocal, engine


TABLE_CODES = [f"M{i}" for i in range(1, 21)]

MENU_CATEGORIES = [
    ("Entradas", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80", 1),
    ("Principal", "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80", 2),
    ("Postres", "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80", 3),
    ("Cervezas", "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80", 4),
    ("Tragos", "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80", 5),
    ("Vinos", "https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&w=900&q=80", 6),
    ("Sin alcohol", "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80", 7),
    ("Sin gluten", "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80", 8),
    ("Vegetarianos", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80", 9),
]

PRODUCTS = [
    {
        "category": "Principal",
        "name": "Hamburguesa Clasica",
        "image_url": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80",
        "description": "Carne, queso, lechuga y tomate",
        "base_price": Decimal("12000.00"),
        "fulfillment_sector": "KITCHEN",
        "variants": [("Sin cebolla", Decimal("0.00")), ("Doble carne", Decimal("2500.00"))],
    },
    {
        "category": "Principal",
        "name": "Milanesa con Papas",
        "image_url": "https://images.unsplash.com/photo-1532635241-17e820acc59f?auto=format&fit=crop&w=900&q=80",
        "description": "Milanesa vacuna con papas fritas",
        "base_price": Decimal("14000.00"),
        "fulfillment_sector": "KITCHEN",
        "variants": [],
    },
    {
        "category": "Principal",
        "name": "Pizza Muzzarella",
        "image_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
        "description": "Pizza individual",
        "base_price": Decimal("11000.00"),
        "fulfillment_sector": "KITCHEN",
        "variants": [],
    },
    {
        "category": "Tragos",
        "name": "Gin Tonic",
        "image_url": "https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=80",
        "description": "Gin con tonica",
        "base_price": Decimal("9000.00"),
        "fulfillment_sector": "BAR",
        "variants": [("Extra limon", Decimal("500.00"))],
    },
    {
        "category": "Tragos",
        "name": "Fernet con Cola",
        "image_url": "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80",
        "description": "Vaso largo",
        "base_price": Decimal("8000.00"),
        "fulfillment_sector": "BAR",
        "variants": [("Sin hielo", Decimal("0.00"))],
    },
    {
        "category": "Tragos",
        "name": "Mojito",
        "image_url": "https://images.unsplash.com/photo-1551024709-8f23befc6cf7?auto=format&fit=crop&w=900&q=80",
        "description": "Ron, lima, menta y soda",
        "base_price": Decimal("9500.00"),
        "fulfillment_sector": "BAR",
        "variants": [],
    },
    {
        "category": "Sin alcohol",
        "name": "Agua sin Gas",
        "image_url": "https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=900&q=80",
        "description": "Botella 500ml",
        "base_price": Decimal("3000.00"),
        "fulfillment_sector": "WAITER",
        "variants": [],
    },
    {
        "category": "Sin alcohol",
        "name": "Agua con Gas",
        "image_url": "https://images.unsplash.com/photo-1564419315943-9c2e0f0df77d?auto=format&fit=crop&w=900&q=80",
        "description": "Botella 500ml",
        "base_price": Decimal("3000.00"),
        "fulfillment_sector": "WAITER",
        "variants": [],
    },
    {
        "category": "Sin alcohol",
        "name": "Gaseosa Cola",
        "image_url": "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=900&q=80",
        "description": "Lata 354ml",
        "base_price": Decimal("3500.00"),
        "fulfillment_sector": "WAITER",
        "variants": [],
    },
]

STAFF_USERS = [
    ("ADMIN", "Dueno", "dueno"),
    ("ADMIN", "Admin", "admin"),
    ("KITCHEN", "Cocina", "kitchen"),
    ("BAR", "Barra", "bar"),
    ("WAITER", "Mozo", "waiter"),
]


def ensure_postgres_url() -> None:
    if not settings.database_url.startswith("postgres"):
        raise RuntimeError(
            f"bootstrap_postgres.py requires a postgres DATABASE_URL. Current value: {settings.database_url!r}"
        )


def get_or_create_tenant(db: Session) -> Tenant:
    tenant = db.scalar(select(Tenant).where(Tenant.name == "Comanda Demo"))
    if tenant:
        return tenant
    tenant = Tenant(name="Comanda Demo")
    db.add(tenant)
    db.flush()
    return tenant


def get_or_create_store(db: Session, tenant: Tenant, owner_hash: str) -> Store:
    store = db.scalar(select(Store).where(Store.tenant_id == tenant.id, Store.name == "Local Centro"))
    if store:
        if not store.owner_password_hash:
            store.owner_password_hash = owner_hash
        return store
    store = Store(
        tenant_id=tenant.id,
        name="Local Centro",
        owner_password_hash=owner_hash,
        theme_preset="CLASSIC",
        accent_color="ROJO",
        background_color="ROJO",
        show_watermark_logo=False,
        print_mode="MANUAL",
        show_live_total_to_client=True,
    )
    db.add(store)
    db.flush()
    return store


def ensure_tables(db: Session, store: Store) -> None:
    existing = {
        row.code: row
        for row in db.scalars(select(Table).where(Table.store_id == store.id))
    }
    for code in TABLE_CODES:
        if code in existing:
            continue
        db.add(Table(store_id=store.id, code=code, active=True))


def ensure_staff(db: Session, store: Store, pin_hash: str) -> None:
    existing = {
        row.username: row
        for row in db.scalars(select(StaffAccount).where(StaffAccount.store_id == store.id))
    }
    for sector, display_name, username in STAFF_USERS:
        row = existing.get(username)
        if row:
            row.display_name = row.display_name or display_name
            row.sector = row.sector or sector
            row.active = True
            if row.pin_hash.startswith("CHANGE_ME_HASH_"):
                row.pin_hash = pin_hash
            continue
        db.add(
            StaffAccount(
                store_id=store.id,
                sector=sector,
                display_name=display_name,
                username=username,
                pin_hash=pin_hash,
                active=True,
            )
        )


def ensure_categories(db: Session, store: Store) -> dict[str, MenuCategory]:
    existing = {
        row.name: row
        for row in db.scalars(select(MenuCategory).where(MenuCategory.store_id == store.id))
    }
    for name, image_url, sort_order in MENU_CATEGORIES:
        row = existing.get(name)
        if row:
            row.image_url = image_url
            row.sort_order = sort_order
            row.active = True
            continue
        row = MenuCategory(
            store_id=store.id,
            name=name,
            image_url=image_url,
            sort_order=sort_order,
            active=True,
        )
        db.add(row)
        db.flush()
        existing[name] = row
    return existing


def ensure_products(db: Session, store: Store, categories: dict[str, MenuCategory]) -> None:
    existing = {
        row.name: row
        for row in db.scalars(select(Product).where(Product.store_id == store.id))
    }
    for entry in PRODUCTS:
        category = categories[entry["category"]]
        row = existing.get(entry["name"])
        if row:
            row.category_id = category.id
            row.image_url = entry["image_url"]
            row.description = entry["description"]
            row.base_price = entry["base_price"]
            row.fulfillment_sector = entry["fulfillment_sector"]
            row.active = True
            row.archived = False
        else:
            row = Product(
                store_id=store.id,
                category_id=category.id,
                name=entry["name"],
                image_url=entry["image_url"],
                description=entry["description"],
                base_price=entry["base_price"],
                fulfillment_sector=entry["fulfillment_sector"],
                active=True,
                archived=False,
            )
            db.add(row)
            db.flush()
            existing[entry["name"]] = row

        variants_existing = {
            variant.name: variant
            for variant in db.scalars(select(ProductVariant).where(ProductVariant.product_id == row.id))
        }
        for variant_name, extra_price in entry["variants"]:
            variant = variants_existing.get(variant_name)
            if variant:
                variant.extra_price = extra_price
                variant.active = True
            else:
                db.add(
                    ProductVariant(
                        product_id=row.id,
                        name=variant_name,
                        extra_price=extra_price,
                        active=True,
                    )
                )


def main() -> None:
    ensure_postgres_url()
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        pin_hash = hash_pin("1234")
        tenant = get_or_create_tenant(db)
        store = get_or_create_store(db, tenant, pin_hash)
        ensure_tables(db, store)
        ensure_staff(db, store, pin_hash)
        categories = ensure_categories(db, store)
        ensure_products(db, store, categories)
        db.commit()

    print("Postgres bootstrap completed.")
    print(f"DATABASE_URL target: {settings.database_url}")
    print("Seed ready:")
    print("- store: Local Centro")
    print("- tables: M1..M20")
    print("- users: dueno/admin/kitchen/bar/waiter")
    print("- demo pin: 1234")


if __name__ == "__main__":
    main()
