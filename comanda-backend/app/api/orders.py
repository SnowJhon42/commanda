from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductExtraOption,
    ProductVariant,
    Table,
    TableSession,
    TableSessionStatus,
)
from app.db.session import get_db
from app.schemas.orders import (
    CreateOrderRequest,
    CreateOrderResponse,
    OrderDetailResponse,
    OrderItemOut,
    OrderSectorDetailOut,
    SectorStatusOut,
)
from app.services.item_status import recompute_order_status_from_items
from app.services.order_routing import route_item_to_sector
from app.services.realtime import event_bus
from app.services.table_code import normalize_table_code
from app.services.ticket_generator import next_ticket_number

router = APIRouter(tags=["orders"])
ACTIVE_TABLE_SESSION_STATUSES = (
    TableSessionStatus.OPEN.value,
    TableSessionStatus.MESA_OCUPADA.value,
    TableSessionStatus.CON_PEDIDO.value,
)


@router.post("/orders", response_model=CreateOrderResponse, status_code=201)
def create_order(payload: CreateOrderRequest, db: Session = Depends(get_db)) -> CreateOrderResponse:
    normalized_table_code = normalize_table_code(payload.table_code)
    table = db.scalar(
        select(Table).where(Table.store_id == payload.store_id, Table.code == normalized_table_code, Table.active == True)
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found or inactive")
    if not payload.items:
        raise HTTPException(status_code=422, detail="At least one item is required")

    ticket_number = next_ticket_number(db, payload.store_id)
    open_table_session = db.scalar(
        select(TableSession)
        .where(
            TableSession.store_id == payload.store_id,
            TableSession.table_id == table.id,
            TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
        )
        .order_by(TableSession.id.desc())
        .limit(1)
    )
    order = Order(
        tenant_id=payload.tenant_id,
        store_id=payload.store_id,
        table_id=table.id,
        table_session_id=open_table_session.id if open_table_session else None,
        guest_count=payload.guest_count,
        ticket_number=ticket_number,
        status_aggregated=OrderStatus.RECEIVED.value,
    )
    db.add(order)
    db.flush()

    sectors_present: set[str] = set()
    for raw_item in payload.items:
        product = db.scalar(
            select(Product).where(Product.id == raw_item.product_id, Product.store_id == payload.store_id, Product.active == True)
        )
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {raw_item.product_id} not found")
        variant_price = 0.0
        if raw_item.variant_id:
            variant = db.scalar(
                select(ProductVariant).where(
                    ProductVariant.id == raw_item.variant_id,
                    ProductVariant.product_id == product.id,
                    ProductVariant.active == True,
                )
            )
            if not variant:
                raise HTTPException(status_code=404, detail=f"Variant {raw_item.variant_id} not found")
            variant_price = float(variant.extra_price)
        extra_option_ids = sorted({int(extra_id) for extra_id in (raw_item.extra_option_ids or [])})
        extras_total = 0.0
        extra_names: list[str] = []
        if extra_option_ids:
            extras = db.scalars(
                select(ProductExtraOption).where(
                    ProductExtraOption.product_id == product.id,
                    ProductExtraOption.id.in_(extra_option_ids),
                    ProductExtraOption.active == True,
                )
            ).all()
            if len(extras) != len(extra_option_ids):
                raise HTTPException(status_code=422, detail="One or more extras are invalid for this product")
            extras_total = sum(float(extra.extra_price) for extra in extras)
            extra_names = [extra.name for extra in sorted(extras, key=lambda row: row.id)]

        notes_parts: list[str] = []
        if raw_item.notes and raw_item.notes.strip():
            notes_parts.append(raw_item.notes.strip())
        if extra_names:
            notes_parts.append(f"Extras: {', '.join(extra_names)}")
        merged_notes = " | ".join(notes_parts) if notes_parts else None

        sector = route_item_to_sector(product)
        sectors_present.add(sector)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                variant_id=raw_item.variant_id,
                qty=raw_item.qty,
                unit_price=float(product.base_price) + variant_price + extras_total,
                notes=merged_notes,
                sector=sector,
                status=OrderStatus.RECEIVED.value,
            )
        )

    order.status_aggregated = recompute_order_status_from_items(db, order.id)
    if open_table_session:
        open_table_session.guest_count = max(int(open_table_session.guest_count or 1), int(payload.guest_count))
        open_table_session.status = TableSessionStatus.CON_PEDIDO.value
        db.add(open_table_session)

    db.commit()
    event_bus.publish(
        "order.created",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "table_code": normalized_table_code,
            "status_aggregated": order.status_aggregated,
        },
    )
    event_bus.publish(
        "items.changed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "table_code": normalized_table_code,
            "item_sector": None,
            "item_status": OrderStatus.RECEIVED.value,
            "reason": "order_created",
        },
    )
    if open_table_session:
        event_bus.publish(
            "table.session.updated",
            {
                "table_session_id": open_table_session.id,
                "store_id": order.store_id,
                "table_code": normalized_table_code,
                "guest_count": open_table_session.guest_count,
                "status": open_table_session.status,
                "active_order_id": order.id,
            },
        )
    return CreateOrderResponse(
        order_id=order.id,
        ticket_number=order.ticket_number,
        status_aggregated=order.status_aggregated,
        sectors=[SectorStatusOut(sector=s, status=OrderStatus.RECEIVED.value) for s in sorted(sectors_present)],
    )


@router.get("/orders/{order_id}", response_model=OrderDetailResponse)
def get_order(order_id: int, db: Session = Depends(get_db)) -> OrderDetailResponse:
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.table))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return OrderDetailResponse(
        id=order.id,
        tenant_id=order.tenant_id,
        store_id=order.store_id,
        table_code=order.table.code,
        guest_count=order.guest_count,
        ticket_number=order.ticket_number,
        status_aggregated=order.status_aggregated,
        sectors=[
            OrderSectorDetailOut(sector=i.sector, status=i.status, updated_at=i.updated_at)
            for i in sorted(order.items, key=lambda row: (row.sector, row.id))
        ],
        items=[
            OrderItemOut(
                id=i.id,
                product_name=i.product.name,
                qty=i.qty,
                unit_price=float(i.unit_price),
                created_by_client_id=i.created_by_client_id,
                created_at=i.created_at,
                notes=i.notes,
                sector=i.sector,
                status=i.status,
            )
            for i in order.items
        ],
        created_at=order.created_at,
    )
