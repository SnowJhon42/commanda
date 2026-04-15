import json
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
    CashRequestStatus,
    ItemStatusEvent,
    Order,
    OrderItem,
    OrderStatus,
    Sector,
    ServiceShift,
    StaffAccount,
    Store,
    Table,
    TableSessionFeedback,
    TableSessionCashRequest,
    TableSession,
    TableSessionClient,
    TableSessionStatus,
)
from app.db.session import get_db
from app.schemas.orders import (
    AdminOrderItemsDetailResponse,
    ChangeTableSessionStatusRequest,
    ChangeTableSessionStatusResponse,
    FeedbackCommentOut,
    FeedbackDistributionOut,
    FeedbackSummaryResponse,
    AdminSectorDelayOut,
    ChangeItemStatusRequest,
    ChangeItemStatusResponse,
    CloseTableSessionResponse,
    CloseShiftResponse,
    ForceCloseTableSessionResponse,
    ItemStatusEventOut,
    MarkOrderPrintRequest,
    MarkOrderPrintResponse,
    StaffBoardItemOut,
    StaffBoardItemsResponse,
    StorePrintSettingsResponse,
    StoreMessagingSettingsResponse,
    ActiveShiftResponse,
    OpenShiftRequest,
    ShiftClosedTableOut,
    ShiftHistoryItemOut,
    ShiftHistoryResponse,
    ShiftSummaryOut,
    StaffShiftOut,
    StoreClientVisibilityResponse,
    StaffTableSessionOut,
    StaffTableSessionsResponse,
    UpdateStorePrintSettingsRequest,
    UpdateStoreMessagingSettingsRequest,
    UpdateStoreClientVisibilityRequest,
)
from app.services.billing import get_latest_bill_split, to_bill_split_out
from app.services.print_tracking import build_order_print_status, mark_order_print_target
from app.services.item_status import change_item_status
from app.services.realtime import event_bus

router = APIRouter(prefix="/staff", tags=["staff"])
ACTIVE_TABLE_SESSION_STATUSES = (
    TableSessionStatus.OPEN.value,
    TableSessionStatus.MESA_OCUPADA.value,
    TableSessionStatus.CON_PEDIDO.value,
)
PRINT_MODES = {"MANUAL", "AUTOMATIC"}
DEFAULT_WHATSAPP_SHARE_TEMPLATE = "Estuve en {restaurant_name} y la pasé muy bien. Mirá la carta acá:\n{menu_url}"


def _order_total_amount(order: Order) -> float:
    return float(sum(float(item.unit_price) * item.qty for item in order.items))


def _serialize_shift(shift: ServiceShift) -> StaffShiftOut:
    return StaffShiftOut(
        id=shift.id,
        store_id=shift.store_id,
        label=shift.label,
        operator_name=shift.operator_name,
        status=shift.status,
        opened_by_staff_id=shift.opened_by_staff_id,
        closed_by_staff_id=shift.closed_by_staff_id,
        opened_at=shift.opened_at,
        closed_at=shift.closed_at,
    )


def _empty_shift_summary() -> ShiftSummaryOut:
    return ShiftSummaryOut(
        closed_covers=0,
        closed_tables=0,
        total_revenue=0,
        avg_duration_minutes=0,
        avg_rating=0,
        feedback_count=0,
        closed_table_details=[],
        top_products=[],
        top_beverages=[],
    )


def _latest_active_shift(db: Session, store_id: int) -> ServiceShift | None:
    return db.scalar(
        select(ServiceShift)
        .where(
            ServiceShift.store_id == store_id,
            ServiceShift.status == "OPEN",
            ServiceShift.closed_at.is_(None),
        )
        .order_by(ServiceShift.opened_at.desc(), ServiceShift.id.desc())
        .limit(1)
    )


def _build_shift_summary(db: Session, *, shift: ServiceShift) -> ShiftSummaryOut:
    closed_sessions = db.scalars(
        select(TableSession)
        .where(TableSession.closed_shift_id == shift.id)
        .options(joinedload(TableSession.table))
        .order_by(TableSession.closed_at.desc(), TableSession.id.desc())
    ).all()

    if not closed_sessions:
        return _empty_shift_summary()

    session_ids = [session.id for session in closed_sessions]
    orders = db.scalars(
        select(Order)
        .where(Order.table_session_id.in_(session_ids))
        .options(joinedload(Order.items))
    ).unique().all()
    orders_by_session: dict[int, list[Order]] = {}
    for order in orders:
        if order.table_session_id is None:
            continue
        orders_by_session.setdefault(order.table_session_id, []).append(order)

    feedback_rows = db.scalars(
        select(TableSessionFeedback).where(TableSessionFeedback.table_session_id.in_(session_ids))
    ).all()
    feedback_by_session: dict[int, list[TableSessionFeedback]] = {}
    for feedback in feedback_rows:
        feedback_by_session.setdefault(feedback.table_session_id, []).append(feedback)

    details: list[ShiftClosedTableOut] = []
    total_revenue = 0.0
    total_duration = 0
    total_covers = 0
    all_ratings: list[int] = []

    for table_session in closed_sessions:
        session_orders = orders_by_session.get(table_session.id, [])
        table_total = sum(_order_total_amount(order) for order in session_orders)
        duration_minutes = _minutes_since(table_session.created_at, _as_utc(table_session.closed_at) or datetime.now(tz=timezone.utc))
        total_revenue += table_total
        total_duration += duration_minutes
        total_covers += int(table_session.guest_count or 0)
        all_ratings.extend(feedback.rating for feedback in feedback_by_session.get(table_session.id, []))
        details.append(
            ShiftClosedTableOut(
                table_code=table_session.table.code if table_session.table else "-",
                guest_count=int(table_session.guest_count or 0),
                total_amount=float(table_total),
                duration_minutes=duration_minutes,
                closed_at=table_session.closed_at,
            )
        )

    closed_tables = len(details)
    avg_rating = (sum(all_ratings) / len(all_ratings)) if all_ratings else 0.0
    avg_duration = round(total_duration / closed_tables) if closed_tables else 0
    return ShiftSummaryOut(
        closed_covers=total_covers,
        closed_tables=closed_tables,
        total_revenue=float(total_revenue),
        avg_duration_minutes=int(avg_duration),
        avg_rating=float(round(avg_rating, 2)),
        feedback_count=len(all_ratings),
        closed_table_details=details,
        top_products=[],
        top_beverages=[],
    )


def _parse_summary_json(raw_summary: str | None) -> ShiftSummaryOut:
    if not raw_summary:
        return _empty_shift_summary()
    try:
        payload = json.loads(raw_summary)
        return ShiftSummaryOut.model_validate(payload)
    except Exception:
        return _empty_shift_summary()


def _order_payment_confirmed(db: Session, order: Order) -> bool:
    total_amount = _order_total_amount(order)
    if total_amount <= 0:
        return True

    bill_split = to_bill_split_out(db, get_latest_bill_split(db, order.id))
    if not bill_split:
        return False

    if bill_split.status != BillSplitStatus.CLOSED.value:
        return False

    return all(part.payment_status == BillPartPaymentStatus.CONFIRMED.value for part in bill_split.parts)


def _minutes_since(reference_dt: datetime | None, now_utc: datetime) -> int:
    if not reference_dt:
        return 0
    reference_aware = reference_dt.replace(tzinfo=timezone.utc) if reference_dt.tzinfo is None else reference_dt
    return max(0, int((now_utc - reference_aware).total_seconds() // 60))


def _as_utc(reference_dt: datetime | None) -> datetime | None:
    if not reference_dt:
        return None
    return reference_dt.replace(tzinfo=timezone.utc) if reference_dt.tzinfo is None else reference_dt


def _finalize_table_session_orders(db: Session, *, table_session: TableSession, staff_id: int) -> list[Order]:
    related_orders = db.scalars(
        select(Order)
        .where(Order.table_session_id == table_session.id, Order.store_id == table_session.store_id)
        .options(joinedload(Order.items))
        .order_by(Order.created_at.desc(), Order.id.desc())
    ).unique().all()

    for order in related_orders:
        for item in order.items:
            if item.status == OrderStatus.DELIVERED.value:
                continue
            previous_status = item.status
            item.status = OrderStatus.DELIVERED.value
            db.add(item)
            db.add(
                ItemStatusEvent(
                    order_id=order.id,
                    item_id=item.id,
                    sector=item.sector,
                    from_status=previous_status,
                    to_status=OrderStatus.DELIVERED.value,
                    changed_by_staff_id=staff_id,
                )
            )
        order.status_aggregated = OrderStatus.DELIVERED.value
        db.add(order)

    closable_splits = db.scalars(
        select(BillSplit)
        .join(Order, Order.id == BillSplit.order_id)
        .where(
            Order.table_session_id == table_session.id,
            Order.store_id == table_session.store_id,
        )
    ).all()
    for split in closable_splits:
        split_parts = db.scalars(
            select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id)
        ).all()
        for part in split_parts:
            if part.payment_status != BillPartPaymentStatus.CONFIRMED.value:
                part.payment_status = BillPartPaymentStatus.CONFIRMED.value
                if not part.confirmed_at:
                    part.confirmed_at = datetime.utcnow()
                if not part.confirmed_by_staff_id:
                    part.confirmed_by_staff_id = staff_id
                db.add(part)
        split.status = BillSplitStatus.CLOSED.value
        if not split.closed_at:
            split.closed_at = datetime.utcnow()
        db.add(split)

    pending_requests = db.scalars(
        select(TableSessionCashRequest).where(
            TableSessionCashRequest.table_session_id == table_session.id,
            TableSessionCashRequest.status == CashRequestStatus.PENDING.value,
        )
    ).all()
    for req in pending_requests:
        req.status = CashRequestStatus.RESOLVED.value
        req.resolved_by_staff_id = staff_id
        req.resolved_at = datetime.utcnow()
        db.add(req)

    return related_orders


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
                unit_price=float(item.unit_price),
                notes=item.notes,
                sector=item.sector,
                status=item.status,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item, order, table in rows
        ],
    )


@router.get("/store-settings/client-visibility", response_model=StoreClientVisibilityResponse)
def get_store_client_visibility(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreClientVisibilityResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return StoreClientVisibilityResponse(
        store_id=store.id,
        show_live_total_to_client=bool(store.show_live_total_to_client),
    )


@router.patch("/store-settings/client-visibility", response_model=StoreClientVisibilityResponse)
def patch_store_client_visibility(
    payload: UpdateStoreClientVisibilityRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreClientVisibilityResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store.show_live_total_to_client = bool(payload.show_live_total_to_client)
    db.add(store)
    db.commit()
    db.refresh(store)
    event_bus.publish(
        "store.settings.updated",
        {
            "store_id": store.id,
            "show_live_total_to_client": bool(store.show_live_total_to_client),
        },
    )
    return StoreClientVisibilityResponse(
        store_id=store.id,
        show_live_total_to_client=bool(store.show_live_total_to_client),
    )


@router.get("/store-settings/print-mode", response_model=StorePrintSettingsResponse)
def get_store_print_mode(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StorePrintSettingsResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    print_mode = (store.print_mode or "MANUAL").upper()
    if print_mode not in PRINT_MODES:
        print_mode = "MANUAL"
    return StorePrintSettingsResponse(store_id=store.id, print_mode=print_mode)


@router.patch("/store-settings/print-mode", response_model=StorePrintSettingsResponse)
def patch_store_print_mode(
    payload: UpdateStorePrintSettingsRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StorePrintSettingsResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    print_mode = (payload.print_mode or "").strip().upper()
    if print_mode not in PRINT_MODES:
        raise HTTPException(status_code=422, detail="Unsupported print mode")

    store.print_mode = print_mode
    db.add(store)
    db.commit()
    db.refresh(store)
    event_bus.publish(
        "store.settings.updated",
        {
            "store_id": store.id,
            "print_mode": store.print_mode,
        },
    )
    return StorePrintSettingsResponse(store_id=store.id, print_mode=store.print_mode)


@router.get("/store-settings/messaging", response_model=StoreMessagingSettingsResponse)
def get_store_messaging_settings(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreMessagingSettingsResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return StoreMessagingSettingsResponse(
        store_id=store.id,
        restaurant_name=store.name,
        whatsapp_share_template=store.whatsapp_share_template or DEFAULT_WHATSAPP_SHARE_TEMPLATE,
    )


@router.patch("/store-settings/messaging", response_model=StoreMessagingSettingsResponse)
def patch_store_messaging_settings(
    payload: UpdateStoreMessagingSettingsRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreMessagingSettingsResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    template = payload.whatsapp_share_template.strip()
    if not template:
        raise HTTPException(status_code=422, detail="Template is required")

    store.whatsapp_share_template = template
    db.add(store)
    db.commit()
    db.refresh(store)
    event_bus.publish(
        "store.settings.updated",
        {
            "store_id": store.id,
            "whatsapp_share_template": store.whatsapp_share_template,
        },
    )
    return StoreMessagingSettingsResponse(
        store_id=store.id,
        restaurant_name=store.name,
        whatsapp_share_template=store.whatsapp_share_template or DEFAULT_WHATSAPP_SHARE_TEMPLATE,
    )


@router.get("/shifts/active", response_model=ActiveShiftResponse)
def get_active_shift(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ActiveShiftResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    shift = _latest_active_shift(db, store_id)
    if not shift:
        return ActiveShiftResponse(active_shift=None, summary=_empty_shift_summary())
    return ActiveShiftResponse(active_shift=_serialize_shift(shift), summary=_build_shift_summary(db, shift=shift))


@router.post("/shifts/open", response_model=ActiveShiftResponse)
def open_shift(
    payload: OpenShiftRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ActiveShiftResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    existing = _latest_active_shift(db, store_id)
    if existing:
        return ActiveShiftResponse(active_shift=_serialize_shift(existing), summary=_build_shift_summary(db, shift=existing))

    shift = ServiceShift(
        store_id=store_id,
        label=payload.label.strip(),
        operator_name=payload.operator_name.strip(),
        status="OPEN",
        opened_by_staff_id=current_staff.id,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return ActiveShiftResponse(active_shift=_serialize_shift(shift), summary=_empty_shift_summary())


@router.post("/shifts/close", response_model=CloseShiftResponse)
def close_shift(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CloseShiftResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    shift = _latest_active_shift(db, store_id)
    if not shift:
        raise HTTPException(status_code=404, detail="No hay turno abierto")

    summary = _build_shift_summary(db, shift=shift)
    shift.status = "CLOSED"
    shift.closed_at = datetime.utcnow()
    shift.closed_by_staff_id = current_staff.id
    shift.summary_json = summary.model_dump_json()
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return CloseShiftResponse(closed_shift=_serialize_shift(shift), summary=summary)


@router.get("/shifts/summaries", response_model=ShiftHistoryResponse)
def list_shift_summaries(
    store_id: int,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ShiftHistoryResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    safe_limit = min(max(limit, 1), 100)
    shifts = db.scalars(
        select(ServiceShift)
        .where(
            ServiceShift.store_id == store_id,
            ServiceShift.status == "CLOSED",
            ServiceShift.closed_at.is_not(None),
        )
        .order_by(ServiceShift.closed_at.desc(), ServiceShift.id.desc())
        .limit(safe_limit)
    ).all()
    return ShiftHistoryResponse(
        items=[
            ShiftHistoryItemOut(
                shift=_serialize_shift(shift),
                summary=_parse_summary_json(shift.summary_json),
            )
            for shift in shifts
        ]
    )


@router.get("/table-sessions", response_model=StaffTableSessionsResponse)
def list_staff_table_sessions(
    store_id: int,
    only_without_order: bool = False,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffTableSessionsResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    safe_limit = min(max(limit, 1), 300)
    active_order_exists = (
        select(func.count())
        .select_from(Order)
        .where(
            Order.table_session_id == TableSession.id,
            Order.store_id == store_id,
            Order.status_aggregated != OrderStatus.DELIVERED.value,
        )
        .correlate(TableSession)
        .scalar_subquery()
    )
    connected_clients_subq = (
        select(func.count())
        .select_from(TableSessionClient)
        .where(TableSessionClient.table_session_id == TableSession.id)
        .correlate(TableSession)
        .scalar_subquery()
    )

    base_query = (
        select(
            TableSession,
            Table,
            active_order_exists.label("active_order_count"),
            connected_clients_subq.label("connected_clients"),
        )
        .join(Table, Table.id == TableSession.table_id)
        .where(
            TableSession.store_id == store_id,
            TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
        )
    )
    if only_without_order:
        base_query = base_query.where(active_order_exists == 0)

    total = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    rows = db.execute(
        base_query
        .order_by(TableSession.created_at.desc(), TableSession.id.desc())
        .limit(safe_limit)
        .offset(offset)
    ).all()

    items = []
    now_utc = datetime.now(tz=timezone.utc)
    for table_session, table, _active_count, connected_clients in rows:
        active_order = db.scalar(
            select(Order)
            .where(
                Order.table_session_id == table_session.id,
                Order.store_id == store_id,
                Order.status_aggregated != OrderStatus.DELIVERED.value,
            )
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(1)
        )
        latest_client_seen_at = db.scalar(
            select(func.max(TableSessionClient.last_seen_at)).where(TableSessionClient.table_session_id == table_session.id)
        )
        elapsed_reference = max(
            [candidate for candidate in [_as_utc(active_order.created_at) if active_order else None, _as_utc(latest_client_seen_at), _as_utc(table_session.created_at)] if candidate is not None],
            default=None,
        )
        elapsed_minutes = _minutes_since(elapsed_reference, now_utc)
        items.append(
            StaffTableSessionOut(
                table_session_id=table_session.id,
                table_code=table.code,
                guest_count=table_session.guest_count,
                status=table_session.status,
                connected_clients=int(connected_clients or 0),
                active_order_id=int(active_order.id) if active_order else None,
                active_order_created_at=active_order.created_at if active_order else None,
                elapsed_minutes=elapsed_minutes,
                created_at=table_session.created_at,
            )
        )

    return StaffTableSessionsResponse(total=int(total), items=items)


@router.patch("/table-sessions/{table_session_id}/status", response_model=ChangeTableSessionStatusResponse)
def patch_table_session_status(
    table_session_id: int,
    payload: ChangeTableSessionStatusRequest,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ChangeTableSessionStatusResponse:
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != current_staff.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    previous_status = table_session.status
    target_status = (payload.to_status or "").strip().upper()
    valid_targets = {
        TableSessionStatus.MESA_OCUPADA.value,
        TableSessionStatus.CON_PEDIDO.value,
        TableSessionStatus.CLOSED.value,
        TableSessionStatus.SE_RETIRARON.value,
    }
    if target_status not in valid_targets:
        raise HTTPException(status_code=422, detail="Unsupported table session status")

    if target_status in {TableSessionStatus.CLOSED.value, TableSessionStatus.SE_RETIRARON.value}:
        _finalize_table_session_orders(db, table_session=table_session, staff_id=current_staff.id)
        table_session.closed_at = datetime.utcnow()
        active_shift = _latest_active_shift(db, table_session.store_id)
        table_session.closed_shift_id = active_shift.id if active_shift else None
    else:
        table_session.closed_at = None
        table_session.closed_shift_id = None

    table_session.status = target_status
    db.add(table_session)
    db.commit()
    db.refresh(table_session)

    table_code = db.scalar(select(Table.code).where(Table.id == table_session.table_id)) or "-"
    event_bus.publish(
        "table.session.updated",
        {
            "table_session_id": table_session.id,
            "store_id": table_session.store_id,
            "table_code": table_code,
            "guest_count": table_session.guest_count,
            "status": table_session.status,
        },
    )
    if table_session.status == TableSessionStatus.CLOSED.value:
        event_bus.publish(
            "table.session.closed",
            {
                "table_session_id": table_session.id,
                "store_id": table_session.store_id,
                "table_code": table_code,
                "closed_at": table_session.closed_at.isoformat() if table_session.closed_at else None,
            },
        )

    return ChangeTableSessionStatusResponse(
        table_session_id=table_session.id,
        previous_status=previous_status,
        current_status=table_session.status,
        updated_by_staff_id=current_staff.id,
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
    table_session = None
    if order.table_session_id:
        table_session = db.scalar(select(TableSession).where(TableSession.id == order.table_session_id))
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
                unit_price=float(item.unit_price),
                notes=item.notes,
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
        cash_requests=[
            {
                "id": req.id,
                "table_session_id": req.table_session_id,
                "order_id": req.order_id,
                "client_id": req.client_id,
                "payer_label": req.payer_label,
                "request_kind": req.request_kind,
                "note": req.note,
                "status": req.status,
                "created_at": req.created_at,
                "resolved_at": req.resolved_at,
                "resolved_by_staff_id": req.resolved_by_staff_id,
            }
            for req in db.scalars(
                select(TableSessionCashRequest)
                .where(TableSessionCashRequest.order_id == order.id)
                .order_by(TableSessionCashRequest.created_at.desc(), TableSessionCashRequest.id.desc())
            ).all()
        ],
        print_status=build_order_print_status(order),
        table_elapsed_minutes=_minutes_since(table_session.created_at if table_session else order.created_at, now_utc),
        order_elapsed_minutes=_minutes_since(order.created_at, now_utc),
        created_at=order.created_at,
    )


@router.post("/orders/{order_id}/print-status", response_model=MarkOrderPrintResponse)
def mark_order_print_status(
    order_id: int,
    payload: MarkOrderPrintRequest,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> MarkOrderPrintResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.store_id == current_staff.store_id)
        .options(joinedload(Order.items), joinedload(Order.table))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    try:
        touched_targets = mark_order_print_target(order, payload.target)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    order.updated_at = datetime.utcnow()
    db.add(order)
    db.commit()
    db.refresh(order)
    table_code = order.table.code if order.table else "-"
    event_bus.publish(
        "order.print.updated",
        {
            "order_id": order.id,
            "store_id": order.store_id,
            "table_code": table_code,
            "touched_targets": touched_targets,
            "print_status": build_order_print_status(order),
        },
    )
    return MarkOrderPrintResponse(
        order_id=order.id,
        touched_targets=touched_targets,
        print_status=build_order_print_status(order),
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
            TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
        )
        .order_by(TableSession.id.desc())
        .limit(1)
    )
    if not table_session:
        raise HTTPException(status_code=404, detail="No open table session for this table")

    _finalize_table_session_orders(db, table_session=table_session, staff_id=current_staff.id)

    table_session.status = TableSessionStatus.CLOSED.value
    table_session.closed_at = datetime.utcnow()
    active_shift = _latest_active_shift(db, current_staff.store_id)
    table_session.closed_shift_id = active_shift.id if active_shift else None
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


@router.post("/tables/{table_code}/force-close-session", response_model=ForceCloseTableSessionResponse)
def force_close_table_session(
    table_code: str,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ForceCloseTableSessionResponse:
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
            TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
        )
        .order_by(TableSession.id.desc())
        .limit(1)
    )
    latest_order = db.scalar(
        select(Order)
        .where(
            Order.store_id == current_staff.store_id,
            Order.table_id == table.id,
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(1)
    )

    if not table_session and not latest_order:
        raise HTTPException(status_code=404, detail="No active session or order found for this table")

    if table_session:
        _finalize_table_session_orders(db, table_session=table_session, staff_id=current_staff.id)
        table_session.status = TableSessionStatus.CLOSED.value
        table_session.closed_at = datetime.utcnow()
        active_shift = _latest_active_shift(db, current_staff.store_id)
        table_session.closed_shift_id = active_shift.id if active_shift else None
        db.add(table_session)

    db.commit()
    if table_session:
        db.refresh(table_session)

        event_bus.publish(
            "table.session.closed",
            {
                "table_session_id": table_session.id,
                "store_id": current_staff.store_id,
                "table_code": table.code,
                "closed_at": table_session.closed_at.isoformat() if table_session.closed_at else None,
                "forced": True,
            },
        )

    return ForceCloseTableSessionResponse(
        table_session_id=table_session.id if table_session else (latest_order.table_session_id or 0),
        table_code=table.code,
        status=TableSessionStatus.CLOSED.value,
        closed_at=(table_session.closed_at if table_session else datetime.utcnow()) or datetime.utcnow(),
        forced=True,
    )
