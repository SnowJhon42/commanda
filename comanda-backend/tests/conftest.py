from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base


@pytest.fixture()
def session_factory(tmp_path: Path):
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    yield TestingSessionLocal
    engine.dispose()


def seed_minimum_store_data(db: Session):
    from app.core.security import hash_pin
    from app.db.models import FulfillmentSector, MenuCategory, Product, Sector, StaffAccount, Store, Table, Tenant

    tenant = Tenant(name="Test Tenant")
    db.add(tenant)
    db.flush()

    store = Store(tenant_id=tenant.id, name="Test Store")
    db.add(store)
    db.flush()

    table = Table(store_id=store.id, code="M1", active=True)
    category = MenuCategory(store_id=store.id, name="Platos")
    db.add_all([table, category])
    db.flush()

    product = Product(
        store_id=store.id,
        category_id=category.id,
        name="Milanesa",
        base_price=1000,
        fulfillment_sector=FulfillmentSector.KITCHEN.value,
        active=True,
    )
    admin = StaffAccount(
        store_id=store.id,
        sector=Sector.ADMIN.value,
        username="admin",
        pin_hash=hash_pin("1234"),
        active=True,
    )
    db.add_all([product, admin])
    db.commit()
    db.refresh(tenant)
    db.refresh(store)
    db.refresh(table)
    db.refresh(product)
    db.refresh(admin)
    return tenant, store, table, product, admin
