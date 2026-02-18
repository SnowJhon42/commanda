from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_staff
from app.db.models import ItemStatusEvent, Order, OrderItem, OrderStatus, Sector, StaffAccount, Table
from app.db.session import get_db
from app.schemas.orders import (
    AdminOrderItemsDetailResponse,
    AdminOrderSummaryOut,
    AdminOrdersResponse,
    AdminSectorDelayOut,
    ItemStatusEventOut,
    SectorStatusOut,
    StaffBoardItemOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _ensure_admin(current_staff: StaffAccount) -> None:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/orders", response_model=AdminOrdersResponse)
def list_admin_orders(
    store_id: int,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> AdminOrdersResponse:
    _ensure_admin(current_staff)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    query = (
        select(Order, Table)
        .join(Table, Table.id == Order.table_id)
        .where(Order.store_id == store_id)
        .options(joinedload(Order.items))
    )
    if status:
        query = query.where(Order.status_aggregated == status)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orders_with_table = db.execute(query.order_by(Order.created_at.desc()).limit(limit).offset(offset)).unique().all()

    return AdminOrdersResponse(
        total=total,
        items=[
            AdminOrderSummaryOut(
                order_id=order.id,
                table_code=table.code,
                guest_count=order.guest_count,
                total_items=sum(item.qty for item in order.items),
                delivered_items=sum(item.qty for item in order.items if item.status == OrderStatus.DELIVERED.value),
                total_amount=float(sum(float(item.unit_price) * item.qty for item in order.items)),
                status_aggregated=order.status_aggregated,
                sectors=[
                    SectorStatusOut(sector=item.sector, status=item.status)
                    for item in sorted(order.items, key=lambda row: (row.sector, row.id))
                ],
                created_at=order.created_at,
            )
            for order, table in orders_with_table
        ],
    )


@router.get("/orders/{order_id}/items", response_model=AdminOrderItemsDetailResponse)
def get_admin_order_items_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> AdminOrderItemsDetailResponse:
    _ensure_admin(current_staff)
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.store_id == current_staff.store_id)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.table))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    now_utc = datetime.now(tz=timezone.utc)
    delays: list[AdminSectorDelayOut] = []
    sectors = sorted({item.sector for item in order.items})
    for sector in sectors:
        waiting = [
            item
            for item in order.items
            if item.sector == sector and item.status in {OrderStatus.RECEIVED.value, OrderStatus.IN_PROGRESS.value}
        ]
        if not waiting:
            delays.append(AdminSectorDelayOut(sector=sector, waiting_items=0, oldest_waiting_minutes=0))
            continue
        oldest = min(item.created_at for item in waiting)
        oldest_aware = oldest.replace(tzinfo=timezone.utc) if oldest.tzinfo is None else oldest
        delta = now_utc - oldest_aware
        delays.append(
            AdminSectorDelayOut(
                sector=sector,
                waiting_items=len(waiting),
                oldest_waiting_minutes=max(0, int(delta.total_seconds() // 60)),
            )
        )

    return AdminOrderItemsDetailResponse(
        order_id=order.id,
        table_session_id=order.table_session_id,
        table_code=order.table.code,
        guest_count=order.guest_count,
        ticket_number=order.ticket_number,
        status_aggregated=order.status_aggregated,
        total_amount=float(sum(float(item.unit_price) * item.qty for item in order.items)),
        delivered_items=sum(item.qty for item in order.items if item.status == OrderStatus.DELIVERED.value),
        total_items=sum(item.qty for item in order.items),
        delays=delays,
        items=[
            StaffBoardItemOut(
                item_id=item.id,
                order_id=order.id,
                table_code=order.table.code,
                guest_count=order.guest_count,
                item_name=item.product.name,
                qty=item.qty,
                sector=item.sector,
                status=item.status,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in sorted(order.items, key=lambda row: (row.sector, row.created_at, row.id))
        ],
        events=[
            ItemStatusEventOut(
                id=event.id,
                item_id=event.item_id,
                sector=event.sector,
                from_status=event.from_status,
                to_status=event.to_status,
                changed_by_staff_id=event.changed_by_staff_id,
                created_at=event.created_at,
            )
            for event in db.scalars(
                select(ItemStatusEvent)
                .where(ItemStatusEvent.order_id == order.id)
                .order_by(ItemStatusEvent.created_at.desc(), ItemStatusEvent.id.desc())
            ).all()
        ],
        created_at=order.created_at,
    )
