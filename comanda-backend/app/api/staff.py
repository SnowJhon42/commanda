from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_sector_access, get_current_staff
from app.db.models import (
    BillPartPaymentStatus,
    BillSplit,
    BillSplitPart,
    BillSplitStatus,
    ItemStatusEvent,
    Order,
    OrderItem,
    OrderStatus,
    Sector,
    StaffAccount,
    Table,
    TableSessionFeedback,
    TableSession,
    TableSessionStatus,
)
from app.db.session import get_db
from app.schemas.orders import (
    AdminOrderItemsDetailResponse,
    FeedbackCommentOut,
    FeedbackDistributionOut,
    FeedbackSummaryResponse,
    AdminSectorDelayOut,
    ChangeItemStatusRequest,
    ChangeItemStatusResponse,
    CloseTableSessionResponse,
    ItemStatusEventOut,
    StaffBoardItemOut,
    StaffBoardItemsResponse,
)
from app.services.billing import get_latest_bill_split, to_bill_split_out
from app.services.item_status import change_item_status
from app.services.realtime import event_bus

router = APIRouter(prefix="/staff", tags=["staff"])


def _board_filter_for_sector(sector: str):
    if sector == Sector.KITCHEN.value:
        return and_(
            OrderItem.sector == Sector.KITCHEN.value,
            OrderItem.status.in_([OrderStatus.RECEIVED.value, OrderStatus.IN_PROGRESS.value]),
        )
    if sector == Sector.BAR.value:
        return and_(
            OrderItem.sector == Sector.BAR.value,
            OrderItem.status.in_([OrderStatus.RECEIVED.value, OrderStatus.IN_PROGRESS.value]),
        )
    if sector == Sector.WAITER.value:
        return or_(
            OrderItem.status == OrderStatus.DONE.value,
            and_(OrderItem.sector == Sector.WAITER.value, OrderItem.status == OrderStatus.RECEIVED.value),
        )
    if sector == Sector.ADMIN.value:
        return OrderItem.status != OrderStatus.DELIVERED.value
    raise HTTPException(status_code=422, detail=f"Unsupported sector filter: {sector}")


@router.get("/items/board", response_model=StaffBoardItemsResponse)
def list_staff_items_board(
    store_id: int,
    sector: str,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffBoardItemsResponse:
    ensure_sector_access(current_staff, sector)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    filter_expr = _board_filter_for_sector(sector)
    base_query = (
        select(OrderItem, Order, Table)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Table, Table.id == Order.table_id)
        .where(Order.store_id == store_id, filter_expr)
    )

    total = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    rows = db.execute(
        base_query.order_by(Order.created_at.asc(), OrderItem.created_at.asc(), OrderItem.id.asc()).limit(limit).offset(offset)
    ).all()

    return StaffBoardItemsResponse(
        total=total,
        items=[
            StaffBoardItemOut(
                item_id=item.id,
                order_id=order.id,
                table_code=table.code,
                guest_count=order.guest_count,
                item_name=item.product.name if item.product else f"Item {item.id}",
                qty=item.qty,
                sector=item.sector,
                status=item.status,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item, order, table in rows
        ],
    )


@router.get("/orders/{order_id}/items", response_model=AdminOrderItemsDetailResponse)
def get_staff_order_items_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> AdminOrderItemsDetailResponse:
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
        bill_split=to_bill_split_out(db, get_latest_bill_split(db, order.id)),
        created_at=order.created_at,
    )


@router.get("/feedback/summary", response_model=FeedbackSummaryResponse)
def get_feedback_summary(
    store_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> FeedbackSummaryResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    safe_limit = min(max(limit, 1), 100)
    total_feedbacks = db.scalar(
        select(func.count()).select_from(TableSessionFeedback).where(TableSessionFeedback.store_id == store_id)
    ) or 0
    avg_rating = db.scalar(
        select(func.avg(TableSessionFeedback.rating)).where(TableSessionFeedback.store_id == store_id)
    )

    distribution_rows = db.execute(
        select(TableSessionFeedback.rating, func.count().label("count"))
        .where(TableSessionFeedback.store_id == store_id)
        .group_by(TableSessionFeedback.rating)
    ).all()
    distribution_by_rating = {int(row[0]): int(row[1]) for row in distribution_rows}
    distribution = [
        FeedbackDistributionOut(rating=rating, count=distribution_by_rating.get(rating, 0))
        for rating in [5, 4, 3, 2, 1]
    ]

    comments_rows = db.execute(
        select(TableSessionFeedback, TableSession, Table)
        .join(TableSession, TableSession.id == TableSessionFeedback.table_session_id)
        .join(Table, Table.id == TableSession.table_id)
        .where(
            TableSessionFeedback.store_id == store_id,
            TableSessionFeedback.comment.is_not(None),
            TableSessionFeedback.comment != "",
        )
        .order_by(TableSessionFeedback.created_at.desc(), TableSessionFeedback.id.desc())
        .limit(safe_limit)
    ).all()

    latest_comments = [
        FeedbackCommentOut(
            table_session_id=feedback.table_session_id,
            table_code=table.code,
            client_id=feedback.client_id,
            rating=feedback.rating,
            comment=feedback.comment or "",
            created_at=feedback.created_at,
        )
        for feedback, _session, table in comments_rows
    ]

    return FeedbackSummaryResponse(
        avg_rating=float(avg_rating) if avg_rating is not None else 0.0,
        total_feedbacks=int(total_feedbacks),
        distribution=distribution,
        latest_comments=latest_comments,
    )


@router.patch("/items/{item_id}/status", response_model=ChangeItemStatusResponse)
def patch_item_status(
    item_id: int,
    payload: ChangeItemStatusRequest,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ChangeItemStatusResponse:
    item = db.scalar(
        select(OrderItem).where(OrderItem.id == item_id).options()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    order = db.scalar(select(Order).where(Order.id == item.order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found for item")
    if order.store_id != current_staff.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    try:
        changed, previous, order_status = change_item_status(
            db,
            item=item,
            to_status=payload.to_status,
            current_staff=current_staff,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    changed.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(changed)
    table_code = db.scalar(select(Table.code).where(Table.id == order.table_id))
    event_bus.publish(
        "items.changed",
        {
            "order_id": changed.order_id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "table_code": table_code,
            "item_id": changed.id,
            "item_sector": changed.sector,
            "item_status": changed.status,
            "previous_status": previous,
            "status_aggregated": order_status,
            "changed_by_staff_id": current_staff.id,
        },
    )

    return ChangeItemStatusResponse(
        item_id=changed.id,
        order_id=changed.order_id,
        sector=changed.sector,
        previous_status=previous,
        current_status=changed.status,
        status_aggregated=order_status,
        updated_by_staff_id=current_staff.id,
        updated_at=changed.updated_at,
    )


@router.post("/tables/{table_code}/close-session", response_model=CloseTableSessionResponse)
def close_table_session(
    table_code: str,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CloseTableSessionResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    normalized_table = table_code.strip().upper()
    table = db.scalar(select(Table).where(Table.store_id == current_staff.store_id, Table.code == normalized_table))
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    table_session = db.scalar(
        select(TableSession)
        .where(
            TableSession.store_id == current_staff.store_id,
            TableSession.table_id == table.id,
            TableSession.status == TableSessionStatus.OPEN.value,
        )
        .order_by(TableSession.id.desc())
        .limit(1)
    )
    if not table_session:
        raise HTTPException(status_code=404, detail="No open table session for this table")

    has_open_orders = db.scalar(
        select(func.count())
        .select_from(Order)
        .where(
            Order.table_session_id == table_session.id,
            Order.store_id == current_staff.store_id,
            Order.status_aggregated != OrderStatus.DELIVERED.value,
        )
    ) or 0
    if has_open_orders > 0:
        raise HTTPException(status_code=409, detail="Cannot close table session with active non-delivered orders")

    has_pending_bill_parts = db.scalar(
        select(func.count())
        .select_from(BillSplitPart)
        .join(BillSplit, BillSplit.id == BillSplitPart.bill_split_id)
        .join(Order, Order.id == BillSplit.order_id)
        .where(
            Order.table_session_id == table_session.id,
            Order.store_id == current_staff.store_id,
            BillSplit.status != BillSplitStatus.CLOSED.value,
            BillSplitPart.payment_status == BillPartPaymentStatus.PENDING.value,
        )
    ) or 0
    if has_pending_bill_parts > 0:
        raise HTTPException(status_code=409, detail="Cannot close table session with pending bill split payments")

    closable_splits = db.scalars(
        select(BillSplit)
        .join(Order, Order.id == BillSplit.order_id)
        .where(
            Order.table_session_id == table_session.id,
            Order.store_id == current_staff.store_id,
            BillSplit.status == BillSplitStatus.OPEN.value,
        )
    ).all()
    for split in closable_splits:
        split.status = BillSplitStatus.CLOSED.value
        if not split.closed_at:
            split.closed_at = datetime.utcnow()
        db.add(split)

    table_session.status = TableSessionStatus.CLOSED.value
    table_session.closed_at = datetime.utcnow()
    db.add(table_session)
    db.commit()
    db.refresh(table_session)

    event_bus.publish(
        "table.session.closed",
        {
            "table_session_id": table_session.id,
            "store_id": current_staff.store_id,
            "table_code": table.code,
            "closed_at": table_session.closed_at.isoformat() if table_session.closed_at else None,
        },
    )

    return CloseTableSessionResponse(
        table_session_id=table_session.id,
        table_code=table.code,
        status=table_session.status,
        closed_at=table_session.closed_at or datetime.utcnow(),
    )
