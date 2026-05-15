from __future__ import annotations

import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.db.models import (
    CashSession,
    CashSessionStatus,
    Order,
    OrderItem,
    OrderPaymentStatus,
    OrderReviewStatus,
    OrderSectorStatus,
    OrderStatus,
    PaymentGate,
    Product,
    ServiceMode,
    ServiceShift,
    StaffAccount,
    Table,
    TableSession,
    TableSessionClient,
    TableSessionStatus,
)
from app.db.session import SessionLocal


def ensure_postgres_url() -> None:
    if not settings.database_url.startswith("postgres"):
        raise RuntimeError(
            f"seed_postgres_demo_activity.py requires a postgres DATABASE_URL. Current value: {settings.database_url!r}"
        )


def first_staff(db: Session, store_id: int, username: str) -> StaffAccount:
    row = db.scalar(
        select(StaffAccount).where(
            StaffAccount.store_id == store_id,
            StaffAccount.username == username,
            StaffAccount.active == True,
        )
    )
    if not row:
        raise RuntimeError(f"Staff user {username!r} not found for store {store_id}")
    return row


def first_table(db: Session, store_id: int, code: str) -> Table:
    row = db.scalar(select(Table).where(Table.store_id == store_id, Table.code == code))
    if not row:
        raise RuntimeError(f"Table {code!r} not found for store {store_id}")
    return row


def first_product(db: Session, store_id: int, name: str) -> Product:
    row = db.scalar(select(Product).where(Product.store_id == store_id, Product.name == name, Product.active == True))
    if not row:
        raise RuntimeError(f"Product {name!r} not found for store {store_id}")
    return row


def ensure_open_shift(db: Session, store_id: int, admin_staff_id: int) -> ServiceShift:
    existing = db.scalar(
        select(ServiceShift).where(ServiceShift.store_id == store_id, ServiceShift.status == "OPEN")
    )
    if existing:
        return existing
    now = datetime.utcnow()
    shift = ServiceShift(
        store_id=store_id,
        label="Turno tarde",
        operator_name="admin",
        status="OPEN",
        opened_by_staff_id=admin_staff_id,
        opened_at=now - timedelta(hours=1, minutes=10),
    )
    db.add(shift)
    db.flush()
    return shift


def ensure_open_cash_session(db: Session, store_id: int, shift_id: int, admin_staff_id: int) -> CashSession:
    existing = db.scalar(
        select(CashSession).where(CashSession.store_id == store_id, CashSession.status == CashSessionStatus.OPEN.value)
    )
    if existing:
        return existing
    cash = CashSession(
        store_id=store_id,
        service_shift_id=shift_id,
        status=CashSessionStatus.OPEN.value,
        opening_float=Decimal("25000.00"),
        difference_amount=Decimal("0.00"),
        opened_by_staff_id=admin_staff_id,
        opened_at=datetime.utcnow() - timedelta(hours=1, minutes=5),
    )
    db.add(cash)
    db.flush()
    return cash


def ensure_active_session(
    db: Session,
    *,
    store_id: int,
    table_id: int,
    guest_count: int,
    service_mode: str,
    created_at: datetime,
) -> TableSession:
    existing = db.scalar(
        select(TableSession).where(
            TableSession.store_id == store_id,
            TableSession.table_id == table_id,
            TableSession.status.in_([TableSessionStatus.MESA_OCUPADA.value, TableSessionStatus.CON_PEDIDO.value, TableSessionStatus.OPEN.value]),
        )
    )
    if existing:
        if existing.service_mode != service_mode:
            existing.service_mode = service_mode
        if existing.guest_count != guest_count:
            existing.guest_count = guest_count
        if existing.status != TableSessionStatus.CON_PEDIDO.value:
            existing.status = TableSessionStatus.CON_PEDIDO.value
        return existing
    row = TableSession(
        store_id=store_id,
        table_id=table_id,
        guest_count=guest_count,
        status=TableSessionStatus.CON_PEDIDO.value,
        service_mode=service_mode,
        checkout_status="NONE",
        created_at=created_at,
    )
    db.add(row)
    db.flush()
    return row


def ensure_clients(db: Session, table_session_id: int, aliases: list[str], joined_base: datetime) -> None:
    existing = list(
        db.scalars(
            select(TableSessionClient).where(TableSessionClient.table_session_id == table_session_id)
        )
    )
    if existing:
        return
    for idx, alias in enumerate(aliases, start=1):
        db.add(
            TableSessionClient(
                table_session_id=table_session_id,
                client_id=f"demo-{table_session_id}-{idx}",
                alias=alias,
                joined_at=joined_base + timedelta(minutes=idx),
                last_seen_at=datetime.utcnow() - timedelta(seconds=20 * idx),
            )
        )


def max_ticket_number(db: Session, store_id: int) -> int:
    value = db.scalar(select(func.max(Order.ticket_number)).where(Order.store_id == store_id))
    return int(value or 0)


def existing_order_for_session(db: Session, table_session_id: int) -> Order | None:
    return db.scalar(
        select(Order)
        .where(Order.table_session_id == table_session_id)
        .order_by(Order.id.desc())
    )


def create_demo_order(
    db: Session,
    *,
    tenant_id: int,
    store_id: int,
    table_id: int,
    table_session_id: int,
    guest_count: int,
    ticket_number: int,
    service_mode: str,
    payment_gate: str,
    payment_status: str,
    status_aggregated: str,
    created_at: datetime,
    items: list[dict],
) -> Order:
    order = Order(
        tenant_id=tenant_id,
        store_id=store_id,
        table_id=table_id,
        table_session_id=table_session_id,
        guest_count=guest_count,
        ticket_number=ticket_number,
        status_aggregated=status_aggregated,
        review_status=OrderReviewStatus.APPROVED.value,
        service_mode=service_mode,
        payment_gate=payment_gate,
        payment_status=payment_status,
        created_at=created_at,
        updated_at=created_at + timedelta(minutes=2),
    )
    db.add(order)
    db.flush()

    touched_sectors: dict[str, str] = {}
    for idx, item in enumerate(items, start=1):
        item_created_at = created_at + timedelta(minutes=idx)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=item["product_id"],
                created_by_client_id=f"demo-{table_session_id}-1",
                qty=item["qty"],
                unit_price=item["unit_price"],
                notes=item.get("notes"),
                sector=item["sector"],
                status=item["status"],
                created_at=item_created_at,
                updated_at=item_created_at + timedelta(minutes=1),
            )
        )
        touched_sectors[item["sector"]] = item["status"]

    db.flush()

    for sector, status in touched_sectors.items():
        db.add(
            OrderSectorStatus(
                order_id=order.id,
                sector=sector,
                status=status if status != OrderStatus.DELIVERED.value else OrderStatus.DONE.value,
                updated_by_staff_id=None,
                updated_at=created_at + timedelta(minutes=3),
            )
        )

    return order


def seed_demo_activity(db: Session) -> None:
    store_id = 1
    tenant_id = 1
    admin = first_staff(db, store_id, "admin")
    kitchen = first_staff(db, store_id, "kitchen")
    bar = first_staff(db, store_id, "bar")
    waiter = first_staff(db, store_id, "waiter")

    shift = ensure_open_shift(db, store_id, admin.id)
    ensure_open_cash_session(db, store_id, shift.id, admin.id)

    table_m4 = first_table(db, store_id, "M4")
    table_m8 = first_table(db, store_id, "M8")
    table_m9 = first_table(db, store_id, "M9")

    created_base = datetime.utcnow() - timedelta(hours=1, minutes=15)

    session_m4 = ensure_active_session(
        db,
        store_id=store_id,
        table_id=table_m4.id,
        guest_count=2,
        service_mode=ServiceMode.BAR.value,
        created_at=created_base,
    )
    session_m8 = ensure_active_session(
        db,
        store_id=store_id,
        table_id=table_m8.id,
        guest_count=3,
        service_mode=ServiceMode.RESTAURANTE.value,
        created_at=created_base + timedelta(minutes=5),
    )
    session_m9 = ensure_active_session(
        db,
        store_id=store_id,
        table_id=table_m9.id,
        guest_count=2,
        service_mode=ServiceMode.BAR.value,
        created_at=created_base + timedelta(minutes=7),
    )

    ensure_clients(db, session_m4.id, ["Ana", "Fede"], created_base)
    ensure_clients(db, session_m8.id, ["Pau", "Mica", "Juan"], created_base + timedelta(minutes=5))
    ensure_clients(db, session_m9.id, ["Luz", "Marcos"], created_base + timedelta(minutes=7))

    products = {
        name: first_product(db, store_id, name)
        for name in [
            "Gin Tonic",
            "Mojito",
            "Agua sin Gas",
            "Hamburguesa Clasica",
            "Milanesa con Papas",
        ]
    }

    next_ticket = max_ticket_number(db, store_id) + 1

    if not existing_order_for_session(db, session_m4.id):
        create_demo_order(
            db,
            tenant_id=tenant_id,
            store_id=store_id,
            table_id=table_m4.id,
            table_session_id=session_m4.id,
            guest_count=2,
            ticket_number=next_ticket,
            service_mode=ServiceMode.BAR.value,
            payment_gate=PaymentGate.BEFORE_PREPARATION.value,
            payment_status=OrderPaymentStatus.CONFIRMED.value,
            status_aggregated=OrderStatus.IN_PROGRESS.value,
            created_at=created_base + timedelta(minutes=2),
            items=[
                {
                    "product_id": products["Gin Tonic"].id,
                    "qty": 1,
                    "unit_price": products["Gin Tonic"].base_price,
                    "sector": "BAR",
                    "status": OrderStatus.IN_PROGRESS.value,
                },
                {
                    "product_id": products["Agua sin Gas"].id,
                    "qty": 1,
                    "unit_price": products["Agua sin Gas"].base_price,
                    "sector": "WAITER",
                    "status": OrderStatus.DELIVERED.value,
                },
            ],
        )
        next_ticket += 1

    if not existing_order_for_session(db, session_m8.id):
        create_demo_order(
            db,
            tenant_id=tenant_id,
            store_id=store_id,
            table_id=table_m8.id,
            table_session_id=session_m8.id,
            guest_count=3,
            ticket_number=next_ticket,
            service_mode=ServiceMode.RESTAURANTE.value,
            payment_gate=PaymentGate.NONE.value,
            payment_status=OrderPaymentStatus.PENDING.value,
            status_aggregated=OrderStatus.IN_PROGRESS.value,
            created_at=created_base + timedelta(minutes=8),
            items=[
                {
                    "product_id": products["Hamburguesa Clasica"].id,
                    "qty": 1,
                    "unit_price": products["Hamburguesa Clasica"].base_price,
                    "sector": "KITCHEN",
                    "status": OrderStatus.IN_PROGRESS.value,
                },
                {
                    "product_id": products["Mojito"].id,
                    "qty": 1,
                    "unit_price": products["Mojito"].base_price,
                    "sector": "BAR",
                    "status": OrderStatus.RECEIVED.value,
                },
                {
                    "product_id": products["Agua sin Gas"].id,
                    "qty": 1,
                    "unit_price": products["Agua sin Gas"].base_price,
                    "sector": "WAITER",
                    "status": OrderStatus.DELIVERED.value,
                },
            ],
        )
        next_ticket += 1

    if not existing_order_for_session(db, session_m9.id):
        create_demo_order(
            db,
            tenant_id=tenant_id,
            store_id=store_id,
            table_id=table_m9.id,
            table_session_id=session_m9.id,
            guest_count=2,
            ticket_number=next_ticket,
            service_mode=ServiceMode.BAR.value,
            payment_gate=PaymentGate.BEFORE_PREPARATION.value,
            payment_status=OrderPaymentStatus.CONFIRMED.value,
            status_aggregated=OrderStatus.IN_PROGRESS.value,
            created_at=created_base + timedelta(minutes=10),
            items=[
                {
                    "product_id": products["Milanesa con Papas"].id,
                    "qty": 1,
                    "unit_price": products["Milanesa con Papas"].base_price,
                    "sector": "KITCHEN",
                    "status": OrderStatus.RECEIVED.value,
                },
                {
                    "product_id": products["Gin Tonic"].id,
                    "qty": 1,
                    "unit_price": products["Gin Tonic"].base_price,
                    "sector": "BAR",
                    "status": OrderStatus.IN_PROGRESS.value,
                },
            ],
        )

    db.commit()


def main() -> None:
    ensure_postgres_url()
    with SessionLocal() as db:
        seed_demo_activity(db)
    print("Demo activity seeded in Postgres.")
    print("- open shift: Turno tarde")
    print("- open cash session")
    print("- active tables: M4, M8, M9")
    print("- mixed BAR / RESTAURANTE orders ready for testing")


if __name__ == "__main__":
    main()
