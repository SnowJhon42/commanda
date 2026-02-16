from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Order, OrderItem, OrderSectorStatus, OrderStatus, Product, ProductVariant, Table
from app.db.session import get_db
from app.schemas.orders import (
    CreateOrderRequest,
    CreateOrderResponse,
    OrderDetailResponse,
    OrderItemOut,
    OrderSectorDetailOut,
    SectorStatusOut,
)
from app.services.order_routing import route_item_to_sector
from app.services.ticket_generator import next_ticket_number

router = APIRouter(tags=["orders"])


@router.post("/orders", response_model=CreateOrderResponse, status_code=201)
def create_order(payload: CreateOrderRequest, db: Session = Depends(get_db)) -> CreateOrderResponse:
    table = db.scalar(
        select(Table).where(Table.store_id == payload.store_id, Table.code == payload.table_code, Table.active == True)
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found or inactive")
    if not payload.items:
        raise HTTPException(status_code=422, detail="At least one item is required")

    ticket_number = next_ticket_number(db, payload.store_id)
    order = Order(
        tenant_id=payload.tenant_id,
        store_id=payload.store_id,
        table_id=table.id,
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

        sector = route_item_to_sector(product)
        sectors_present.add(sector)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                variant_id=raw_item.variant_id,
                qty=raw_item.qty,
                unit_price=float(product.base_price) + variant_price,
                notes=raw_item.notes,
                sector=sector,
            )
        )

    for sector in sorted(sectors_present):
        db.add(OrderSectorStatus(order_id=order.id, sector=sector, status=OrderStatus.RECEIVED.value))

    db.commit()
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
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.sector_statuses), joinedload(Order.table))
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
            OrderSectorDetailOut(sector=s.sector, status=s.status, updated_at=s.updated_at)
            for s in sorted(order.sector_statuses, key=lambda row: row.sector)
        ],
        items=[OrderItemOut(id=i.id, product_name=i.product.name, qty=i.qty, sector=i.sector) for i in order.items],
        created_at=order.created_at,
    )
