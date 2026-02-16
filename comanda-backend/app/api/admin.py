from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_staff
from app.db.models import Order, OrderItem, OrderSectorStatus, Sector, StaffAccount, Table
from app.db.session import get_db
from app.schemas.orders import AdminOrderSummaryOut, AdminOrdersResponse, OrderDetailResponse, OrderItemOut, OrderSectorDetailOut

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

    query = select(Order, Table).join(Table, Table.id == Order.table_id).where(Order.store_id == store_id)
    if status:
        query = query.where(Order.status_aggregated == status)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orders_with_table = db.execute(query.order_by(Order.created_at.desc()).limit(limit).offset(offset)).all()

    order_ids = [order.id for order, _ in orders_with_table]
    statuses = db.scalars(select(OrderSectorStatus).where(OrderSectorStatus.order_id.in_(order_ids))).all() if order_ids else []
    statuses_by_order: dict[int, list[OrderSectorStatus]] = {}
    for entry in statuses:
        statuses_by_order.setdefault(entry.order_id, []).append(entry)

    return AdminOrdersResponse(
        total=total,
        items=[
            AdminOrderSummaryOut(
                order_id=order.id,
                table_code=table.code,
                status_aggregated=order.status_aggregated,
                sectors=[{"sector": s.sector, "status": s.status} for s in statuses_by_order.get(order.id, [])],
                created_at=order.created_at,
            )
            for order, table in orders_with_table
        ],
    )


@router.get("/orders/{order_id}", response_model=OrderDetailResponse)
def get_admin_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> OrderDetailResponse:
    _ensure_admin(current_staff)
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.store_id == current_staff.store_id)
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
