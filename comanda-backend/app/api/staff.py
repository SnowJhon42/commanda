from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import ensure_sector_access, get_current_staff
from app.db.models import Order, OrderSectorStatus, OrderStatus, StaffAccount, Table
from app.db.session import get_db
from app.schemas.orders import (
    ChangeSectorStatusRequest,
    ChangeSectorStatusResponse,
    StaffOrderOut,
    StaffOrdersResponse,
)
from app.services.order_status import change_sector_status

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("/orders", response_model=StaffOrdersResponse)
def list_staff_orders(
    store_id: int,
    sector: str,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffOrdersResponse:
    ensure_sector_access(current_staff, sector)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    base_query = (
        select(Order, OrderSectorStatus, Table)
        .join(OrderSectorStatus, Order.id == OrderSectorStatus.order_id)
        .join(Table, Table.id == Order.table_id)
        .where(Order.store_id == store_id, OrderSectorStatus.sector == sector)
    )
    if status:
        base_query = base_query.where(OrderSectorStatus.status == status)

    total = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    rows = db.execute(base_query.order_by(Order.created_at.desc()).limit(limit).offset(offset)).all()

    return StaffOrdersResponse(
        total=total,
        items=[
            StaffOrderOut(
                order_id=order.id,
                table_code=table.code,
                sector=sector_status.sector,
                sector_status=sector_status.status,
                status_aggregated=order.status_aggregated,
                created_at=order.created_at,
            )
            for order, sector_status, table in rows
        ],
    )


@router.patch("/orders/{order_id}/sectors/{sector}/status", response_model=ChangeSectorStatusResponse)
def patch_order_sector_status(
    order_id: int,
    sector: str,
    payload: ChangeSectorStatusRequest,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ChangeSectorStatusResponse:
    ensure_sector_access(current_staff, sector)

    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_staff.store_id != order.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    sector_status = db.scalar(
        select(OrderSectorStatus).where(OrderSectorStatus.order_id == order_id, OrderSectorStatus.sector == sector)
    )
    if not sector_status:
        raise HTTPException(status_code=404, detail="Sector not present in order")

    if payload.to_status not in {
        OrderStatus.RECEIVED.value,
        OrderStatus.IN_PROGRESS.value,
        OrderStatus.DONE.value,
        OrderStatus.DELIVERED.value,
    }:
        raise HTTPException(status_code=422, detail="Invalid target status")

    previous = sector_status.status
    try:
        changed = change_sector_status(
            db,
            order=order,
            sector_status=sector_status,
            to_status=payload.to_status,
            changed_by_staff_id=current_staff.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    changed.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    db.refresh(changed)
    return ChangeSectorStatusResponse(
        order_id=order.id,
        sector=changed.sector,
        previous_status=previous,
        current_status=changed.status,
        status_aggregated=order.status_aggregated,
        updated_by_staff_id=current_staff.id,
        updated_at=changed.updated_at,
    )
