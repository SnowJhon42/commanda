import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import ensure_sector_access, get_current_staff
from app.core.security import hash_pin, verify_pin
from app.db.models import (
    BillPartPaymentStatus,
    BillSplit,
    BillSplitPart,
    BillSplitStatus,
    CashSession,
    CashSessionStatus,
    CashRequestStatus,
    ItemStatusEvent,
    Order,
    OrderItem,
    OrderPaymentStatus,
    OrderReviewStatus,
    OrderStatus,
    PaymentMethod,
    PaymentGate,
    PaymentRecord,
    Sector,
    ServiceShift,
    ServiceMode,
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
    ConfirmBarOrderPaymentResponse,
    ReviewOrderResponse,
    CreateStaffAccountRequest,
    MoveTableSessionRequest,
    MoveTableSessionResponse,
    FeedbackCommentOut,
    FeedbackDistributionOut,
    FeedbackSummaryResponse,
    AdminSectorDelayOut,
    ChangeItemStatusRequest,
    ChangeItemStatusResponse,
    BootstrapShiftRequest,
    CloseCashSessionRequest,
    CloseTableSessionResponse,
    CloseShiftResponse,
    CollectOrderPaymentRequest,
    CollectOrderPaymentResponse,
    CashSessionOut,
    CashSessionResponse,
    ForceCloseTableSessionResponse,
    HistoricalSectorAverageOut,
    HistoricalServiceTimesOut,
    ItemStatusEventOut,
    MarkOrderPrintRequest,
    MarkOrderPrintResponse,
    OpenCashSessionRequest,
    StaffBoardItemOut,
    StaffBoardItemsResponse,
    StorePrintSettingsResponse,
    StoreMessagingSettingsResponse,
    StoreProfileResponse,
    StoreThemeSuggestionRequest,
    StoreThemeSuggestionResponse,
    ActiveShiftResponse,
    OpenShiftRequest,
    ShiftClosedTableOut,
    ShiftHistoryItemOut,
    ShiftHistoryResponse,
    ShiftPaymentMethodSummaryOut,
    ShiftPendingOrderOut,
    ShiftSummaryOut,
    StaffAccountOut,
    StaffAccountsResponse,
    StaffShiftOut,
    StoreClientVisibilityResponse,
    StoreFloorPlanItemOut,
    StoreFloorPlanResponse,
    StoreFloorPlanZoneOut,
    StaffTableOut,
    StaffTablesResponse,
    CreateStaffTableRequest,
    CreateStaffTableResponse,
    RestaurantCheckoutResponse,
    StaffTableSessionOut,
    StaffTableSessionsResponse,
    UpdateStorePrintSettingsRequest,
    UpdateStoreMessagingSettingsRequest,
    UpdateStoreClientVisibilityRequest,
    UpdateStoreFloorPlanRequest,
    UpdateStoreProfileRequest,
    UpdateStaffAccountRequest,
)
from app.schemas.menu import ImageUrlPatchIn
from app.services.billing import get_latest_bill_split, to_bill_split_out
from app.services.print_tracking import build_order_print_status, mark_order_print_target
from app.services.item_status import change_item_status
from app.services.realtime import event_bus
from app.services.store_theme import suggest_store_theme

router = APIRouter(prefix="/staff", tags=["staff"])
ACTIVE_TABLE_SESSION_STATUSES = (
    TableSessionStatus.OPEN.value,
    TableSessionStatus.MESA_OCUPADA.value,
    TableSessionStatus.CON_PEDIDO.value,
)
RESTAURANT_CHECKOUT_NONE = "NONE"
RESTAURANT_CHECKOUT_REQUESTED = "REQUESTED"
RESTAURANT_CHECKOUT_READY = "READY"
PRINT_MODES = {"MANUAL", "AUTOMATIC"}
DEFAULT_WHATSAPP_SHARE_TEMPLATE = "Estuve en {restaurant_name} y la pasé muy bien. Mirá la carta acá:\n{menu_url}"
THEME_PRESETS = {"CLASSIC", "MODERN", "PREMIUM"}
ACCENT_COLORS = {"ROJO", "VERDE", "DORADO", "AZUL", "NEGRO"}
DEFAULT_FLOOR_PLAN_ZONES = [
    {"id": "main", "name": "Salon Principal"},
    {"id": "terrace", "name": "Terraza"},
    {"id": "private", "name": "Salon Privado"},
]
FLOOR_PLAN_SHAPES = {"SQUARE", "RECT", "CIRCLE"}


def _store_profile_out(store: Store) -> StoreProfileResponse:
    return StoreProfileResponse(
        store_id=store.id,
        restaurant_name=store.name,
        owner_password_configured=bool(store.owner_password_hash),
        logo_url=store.logo_url,
        cover_image_url=store.cover_image_url,
        theme_preset=store.theme_preset or "CLASSIC",
        accent_color=store.accent_color or "ROJO",
        background_color=store.background_color or "ROJO",
        background_image_url=store.background_image_url,
        show_watermark_logo=bool(store.show_watermark_logo),
        payment_cash_enabled=bool(store.payment_cash_enabled),
        payment_transfer_enabled=bool(store.payment_transfer_enabled),
        payment_card_enabled=bool(store.payment_card_enabled),
        payment_mercado_pago_enabled=bool(store.payment_mercado_pago_enabled),
        payment_modo_enabled=bool(store.payment_modo_enabled),
        payment_transfer_instructions=store.payment_transfer_instructions,
    )


def _validate_owner_password(store: Store, owner_password: str) -> None:
    owner_hash = (store.owner_password_hash or "").strip()
    if not owner_hash or not verify_pin(owner_password, owner_hash):
        raise HTTPException(status_code=403, detail="Contraseña de dueño incorrecta.")


def _admin_store(db: Session, current_staff: StaffAccount) -> Store:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    store = db.get(Store, current_staff.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _require_owner_access(db: Session, current_staff: StaffAccount, owner_password: str | None) -> Store:
    store = _admin_store(db, current_staff)
    _validate_owner_password(store, (owner_password or "").strip())
    return store


def _staff_account_out(staff: StaffAccount) -> StaffAccountOut:
    return StaffAccountOut(
        id=staff.id,
        display_name=staff.display_name,
        username=staff.username,
        sector=staff.sector,
        active=bool(staff.active),
        created_at=staff.created_at,
    )


def _optional_http_image_url(value: str | None, label: str) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if candidate.startswith("blob:"):
        raise HTTPException(status_code=422, detail=f"{label}: subí el archivo o pegá una URL https pública.")
    try:
        return ImageUrlPatchIn(image_url=candidate).image_url
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"{label}: la URL debe empezar con http:// o https://.") from exc


def _sorted_table_codes(db: Session, store_id: int) -> list[str]:
    tables = db.scalars(select(Table).where(Table.store_id == store_id, Table.active == True).order_by(Table.id.asc())).all()

    return [table.code for table in sorted(tables, key=lambda table: _table_sort_key(table.code))]


def _default_floor_plan(table_codes: list[str]) -> StoreFloorPlanResponse:
    items: list[StoreFloorPlanItemOut] = []
    start_x = 48
    start_y = 48
    gap_x = 162
    gap_y = 150
    for index, table_code in enumerate(table_codes):
        row = index // 4
        col = index % 4
        if row % 3 == 0:
            shape = "SQUARE"
            width = 92
            height = 92
        elif row % 3 == 1:
            shape = "RECT"
            width = 118
            height = 78
        else:
            shape = "CIRCLE"
            width = 94
            height = 94
        items.append(
            StoreFloorPlanItemOut(
                table_code=table_code,
                zone_id="main",
                x=float(start_x + col * gap_x),
                y=float(start_y + row * gap_y),
                width=float(width),
                height=float(height),
                shape=shape,
            )
        )
    return StoreFloorPlanResponse(
        store_id=0,
        zones=[StoreFloorPlanZoneOut(**zone) for zone in DEFAULT_FLOOR_PLAN_ZONES],
        items=items,
    )


def _normalize_floor_plan(store: Store, table_codes: list[str]) -> StoreFloorPlanResponse:
    default_plan = _default_floor_plan(table_codes)
    if not store.floor_plan_json:
        return StoreFloorPlanResponse(store_id=store.id, zones=default_plan.zones, items=default_plan.items)

    try:
        payload = json.loads(store.floor_plan_json)
        plan = StoreFloorPlanResponse.model_validate(payload)
    except Exception:
        return StoreFloorPlanResponse(store_id=store.id, zones=default_plan.zones, items=default_plan.items)

    valid_table_codes = set(table_codes)
    zone_ids = {zone.id for zone in plan.zones} or {zone["id"] for zone in DEFAULT_FLOOR_PLAN_ZONES}

    items_by_table: dict[str, StoreFloorPlanItemOut] = {}
    for item in plan.items:
        if item.table_code not in valid_table_codes:
            continue
        if item.shape not in FLOOR_PLAN_SHAPES:
            continue
        zone_id = item.zone_id if item.zone_id in zone_ids else DEFAULT_FLOOR_PLAN_ZONES[0]["id"]
        items_by_table[item.table_code] = StoreFloorPlanItemOut(
            table_code=item.table_code,
            zone_id=zone_id,
            x=item.x,
            y=item.y,
            width=item.width,
            height=item.height,
            shape=item.shape,
        )

    default_items_by_table = {item.table_code: item for item in default_plan.items}
    merged_items = [items_by_table.get(table_code, default_items_by_table[table_code]) for table_code in table_codes]
    return StoreFloorPlanResponse(store_id=store.id, zones=plan.zones or default_plan.zones, items=merged_items)


def _validated_floor_plan_payload(payload: UpdateStoreFloorPlanRequest, table_codes: list[str], store_id: int) -> StoreFloorPlanResponse:
    if not payload.zones:
        raise HTTPException(status_code=422, detail="Debe existir al menos una zona.")

    zone_ids: set[str] = set()
    zones: list[StoreFloorPlanZoneOut] = []
    for zone in payload.zones:
        zone_id = zone.id.strip()
        zone_name = zone.name.strip()
        if not zone_id or not zone_name:
            raise HTTPException(status_code=422, detail="Zona invalida.")
        if zone_id in zone_ids:
            raise HTTPException(status_code=422, detail=f"Zona duplicada: {zone_id}")
        zone_ids.add(zone_id)
        zones.append(StoreFloorPlanZoneOut(id=zone_id, name=zone_name))

    valid_table_codes = set(table_codes)
    seen_tables: set[str] = set()
    items: list[StoreFloorPlanItemOut] = []
    for item in payload.items:
        table_code = item.table_code.strip().upper()
        if table_code not in valid_table_codes:
            raise HTTPException(status_code=422, detail=f"Mesa inexistente en layout: {table_code}")
        if table_code in seen_tables:
            raise HTTPException(status_code=422, detail=f"Mesa duplicada en layout: {table_code}")
        if item.zone_id not in zone_ids:
            raise HTTPException(status_code=422, detail=f"Zona inexistente para mesa {table_code}: {item.zone_id}")
        seen_tables.add(table_code)
        items.append(
            StoreFloorPlanItemOut(
                table_code=table_code,
                zone_id=item.zone_id,
                x=item.x,
                y=item.y,
                width=item.width,
                height=item.height,
                shape=item.shape,
            )
        )

    default_items_by_table = {item.table_code: item for item in _default_floor_plan(table_codes).items}
    for table_code in table_codes:
        if table_code not in seen_tables:
            items.append(default_items_by_table[table_code])

    return StoreFloorPlanResponse(store_id=store_id, zones=zones, items=items)


def _table_sort_key(code: str) -> tuple[int, str]:
    raw = str(code or "").strip().upper()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return (int(digits), raw)
    return (10**9, raw)


def _next_table_code(db: Session, store_id: int) -> str:
    table_codes = db.scalars(select(Table.code).where(Table.store_id == store_id)).all()
    max_number = 0
    for code in table_codes:
        digits = "".join(ch for ch in str(code or "").strip().upper() if ch.isdigit())
        if digits:
            max_number = max(max_number, int(digits))
    return f"M{max_number + 1}"


def _order_total_amount(order: Order) -> float:
    return float(sum(float(item.unit_price) * item.qty for item in order.items))


def _money(value: float | Decimal) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _current_cash_session(db: Session, store_id: int) -> CashSession | None:
    return db.scalar(
        select(CashSession)
        .where(
            CashSession.store_id == store_id,
            CashSession.status == CashSessionStatus.OPEN.value,
            CashSession.closed_at.is_(None),
        )
        .order_by(CashSession.opened_at.desc(), CashSession.id.desc())
        .limit(1)
    )


def _order_confirmed_split_paid_amount(db: Session, order_id: int) -> Decimal:
    confirmed_parts = db.scalars(
        select(BillSplitPart)
        .join(BillSplit, BillSplit.id == BillSplitPart.bill_split_id)
        .where(
            BillSplit.order_id == order_id,
            BillSplitPart.payment_status == BillPartPaymentStatus.CONFIRMED.value,
        )
    ).all()
    return _money(sum((float(part.amount) for part in confirmed_parts), 0.0))


def _order_recorded_paid_amount(db: Session, order_id: int) -> Decimal:
    recorded = db.scalars(
        select(PaymentRecord).where(
            PaymentRecord.order_id == order_id,
            PaymentRecord.voided_at.is_(None),
        )
    ).all()
    return _money(sum((float(payment.amount) for payment in recorded), 0.0))


def _is_prepay_order(order: Order) -> bool:
    return order.payment_gate == PaymentGate.BEFORE_PREPARATION.value


def _order_paid_amount(db: Session, order: Order) -> Decimal:
    if order.review_status == OrderReviewStatus.REJECTED.value:
        return Decimal("0.00")
    recorded_paid = _order_recorded_paid_amount(db, order.id)
    total_amount = _money(_order_total_amount(order))
    if _is_prepay_order(order):
        if recorded_paid > Decimal("0.00"):
            return min(recorded_paid, total_amount)
        confirmed_paid = total_amount if order.payment_status == OrderPaymentStatus.CONFIRMED.value else Decimal("0.00")
        return confirmed_paid
    split_paid = _order_confirmed_split_paid_amount(db, order.id)
    return min(split_paid + recorded_paid, total_amount)


def _order_balance_due(db: Session, order: Order) -> Decimal:
    if order.review_status == OrderReviewStatus.REJECTED.value:
        return Decimal("0.00")
    total = _money(_order_total_amount(order))
    balance = total - _order_paid_amount(db, order)
    return balance if balance > Decimal("0.00") else Decimal("0.00")


def _serialize_cash_session_out(db: Session, cash_session: CashSession) -> CashSessionOut:
    payments = db.scalars(
        select(PaymentRecord).where(
            PaymentRecord.cash_session_id == cash_session.id,
            PaymentRecord.voided_at.is_(None),
        )
    ).all()
    collected_amount = _money(sum((float(payment.amount) for payment in payments), 0.0))
    cash_collected_amount = _money(
        sum((float(payment.amount) for payment in payments if payment.payment_method == PaymentMethod.CASH.value), 0.0)
    )
    expected_amount = _money(float(cash_session.opening_float) + float(cash_collected_amount))
    return CashSessionOut(
        id=cash_session.id,
        store_id=cash_session.store_id,
        service_shift_id=cash_session.service_shift_id,
        status=cash_session.status,
        opening_float=float(cash_session.opening_float),
        collected_amount=float(collected_amount),
        cash_collected_amount=float(cash_collected_amount),
        expected_amount=float(expected_amount),
        declared_amount=float(cash_session.declared_amount) if cash_session.declared_amount is not None else None,
        difference_amount=float(cash_session.difference_amount or 0),
        note=cash_session.note,
        opened_by_staff_id=cash_session.opened_by_staff_id,
        closed_by_staff_id=cash_session.closed_by_staff_id,
        opened_at=cash_session.opened_at,
        closed_at=cash_session.closed_at,
    )


def _confirm_bar_payment_if_ready(
    db: Session,
    order: Order,
    *,
    current_staff: StaffAccount | None = None,
) -> bool:
    if not _is_prepay_order(order):
        return False
    if order.payment_status == OrderPaymentStatus.CONFIRMED.value:
        return False
    if _order_balance_due(db, order) > Decimal("0.00"):
        return False

    order.payment_status = OrderPaymentStatus.CONFIRMED.value
    db.add(order)
    db.flush()

    event_bus.publish(
        "order.bar_payment_confirmed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "service_mode": order.service_mode,
            "payment_gate": order.payment_gate,
            "payment_status": order.payment_status,
            "confirmed_by_staff_id": current_staff.id if current_staff else None,
        },
    )
    event_bus.publish(
        "items.changed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "item_sector": None,
            "item_status": OrderStatus.RECEIVED.value,
            "status_aggregated": order.status_aggregated,
            "reason": "bar_payment_confirmed",
        },
    )
    return True


def _serialize_pending_order(db: Session, order: Order) -> ShiftPendingOrderOut:
    paid_amount = _order_paid_amount(db, order)
    balance_due = _order_balance_due(db, order)
    return ShiftPendingOrderOut(
        order_id=order.id,
        table_code=order.table.code if order.table else "-",
        guest_count=int(order.guest_count or 0),
        total_amount=float(_money(_order_total_amount(order))),
        paid_amount=float(paid_amount),
        balance_due=float(balance_due),
        created_at=order.created_at,
    )


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
        collected_total=0,
        avg_duration_minutes=0,
        avg_rating=0,
        feedback_count=0,
        closed_table_details=[],
        payment_totals=[],
        pending_orders=[],
        pending_orders_count=0,
        cash_session=None,
        top_products=[],
        top_beverages=[],
        historical_service_times=HistoricalServiceTimesOut(),
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


def _build_historical_service_times(db: Session, *, store_id: int) -> HistoricalServiceTimesOut:
    closed_sessions = db.scalars(
        select(TableSession)
        .where(TableSession.store_id == store_id, TableSession.closed_at.is_not(None))
        .order_by(TableSession.closed_at.desc(), TableSession.id.desc())
    ).all()
    if not closed_sessions:
        return HistoricalServiceTimesOut()

    session_ids = [session.id for session in closed_sessions]
    orders = db.scalars(
        select(Order)
        .where(Order.store_id == store_id, Order.table_session_id.in_(session_ids))
        .options(joinedload(Order.items))
    ).unique().all()

    orders_by_session: dict[int, list[Order]] = {}
    for order in orders:
        if order.table_session_id is None:
            continue
        orders_by_session.setdefault(order.table_session_id, []).append(order)

    total_table_duration = 0
    sector_durations: dict[str, list[int]] = {}
    now_utc = datetime.now(tz=timezone.utc)

    for table_session in closed_sessions:
        total_table_duration += _minutes_since(table_session.created_at, _as_utc(table_session.closed_at) or now_utc)
        for order in orders_by_session.get(table_session.id, []):
            sector_items: dict[str, list[OrderItem]] = {}
            for item in order.items:
                sector_items.setdefault(item.sector, []).append(item)

            for sector, items in sector_items.items():
                completed_items = [
                    item for item in items if item.status in {OrderStatus.DONE.value, OrderStatus.DELIVERED.value}
                ]
                if len(completed_items) != len(items):
                    continue
                start_candidates = [_as_utc(item.created_at) for item in items if _as_utc(item.created_at) is not None]
                end_candidates = [
                    _as_utc(item.updated_at) for item in completed_items if _as_utc(item.updated_at) is not None
                ]
                if not start_candidates or not end_candidates:
                    continue
                duration_minutes = _minutes_since(min(start_candidates), max(end_candidates) or now_utc)
                sector_durations.setdefault(sector, []).append(duration_minutes)

    sector_averages = [
        HistoricalSectorAverageOut(
            sector=sector,
            cases_count=len(durations),
            avg_duration_minutes=int(round(sum(durations) / len(durations))) if durations else 0,
        )
        for sector, durations in sorted(sector_durations.items())
        if durations
    ]

    return HistoricalServiceTimesOut(
        avg_table_duration_minutes=int(round(total_table_duration / len(closed_sessions))) if closed_sessions else 0,
        closed_tables_count=len(closed_sessions),
        sector_averages=sector_averages,
    )


def _shift_for_open_cash_session(db: Session, store_id: int) -> ServiceShift | None:
    cash_session = _current_cash_session(db, store_id)
    if not cash_session or not cash_session.service_shift_id:
        return None
    return db.get(ServiceShift, cash_session.service_shift_id)


def _build_shift_summary(db: Session, *, shift: ServiceShift) -> ShiftSummaryOut:
    historical_service_times = _build_historical_service_times(db, store_id=shift.store_id)
    cash_session = db.scalar(
        select(CashSession)
        .where(CashSession.service_shift_id == shift.id)
        .order_by(CashSession.opened_at.desc(), CashSession.id.desc())
        .limit(1)
    )
    pending_orders = db.scalars(
        select(Order)
        .where(
            Order.store_id == shift.store_id,
            Order.table_session_id.is_not(None),
        )
        .options(joinedload(Order.items), joinedload(Order.table), joinedload(Order.table_session))
        .order_by(Order.created_at.asc(), Order.id.asc())
    ).unique().all()
    pending_payment_orders = [
        _serialize_pending_order(db, order)
        for order in pending_orders
        if order.table_session
        and order.table_session.status in ACTIVE_TABLE_SESSION_STATUSES
        and _order_balance_due(db, order) > Decimal("0.00")
    ]
    payment_rows = db.scalars(
        select(PaymentRecord)
        .where(
            PaymentRecord.store_id == shift.store_id,
            PaymentRecord.voided_at.is_(None),
        )
        .order_by(PaymentRecord.created_at.asc(), PaymentRecord.id.asc())
    ).all()
    if cash_session:
        payment_rows = [row for row in payment_rows if row.cash_session_id == cash_session.id]
    closed_sessions = db.scalars(
        select(TableSession)
        .where(TableSession.closed_shift_id == shift.id)
        .options(joinedload(TableSession.table))
        .order_by(TableSession.closed_at.desc(), TableSession.id.desc())
    ).all()

    payment_totals_map: dict[str, dict[str, float | int]] = {}
    collected_total = Decimal("0.00")
    for payment in payment_rows:
        key = payment.payment_method or PaymentMethod.OTHER.value
        bucket = payment_totals_map.setdefault(key, {"total_amount": 0.0, "payments_count": 0})
        bucket["total_amount"] = float(_money(bucket["total_amount"]) + _money(float(payment.amount)))
        bucket["payments_count"] = int(bucket["payments_count"]) + 1
        collected_total += _money(float(payment.amount))

    payment_totals = [
        ShiftPaymentMethodSummaryOut(
            payment_method=method,
            total_amount=float(_money(data["total_amount"])),
            payments_count=int(data["payments_count"]),
        )
        for method, data in sorted(payment_totals_map.items())
    ]

    if not closed_sessions:
        empty = _empty_shift_summary()
        empty.collected_total = float(collected_total)
        empty.payment_totals = payment_totals
        empty.pending_orders = pending_payment_orders
        empty.pending_orders_count = len(pending_payment_orders)
        empty.cash_session = _serialize_cash_session_out(db, cash_session) if cash_session else None
        empty.historical_service_times = historical_service_times
        return empty

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
        collected_total=float(collected_total),
        avg_duration_minutes=int(avg_duration),
        avg_rating=float(round(avg_rating, 2)),
        feedback_count=len(all_ratings),
        closed_table_details=details,
        payment_totals=payment_totals,
        pending_orders=pending_payment_orders,
        pending_orders_count=len(pending_payment_orders),
        cash_session=_serialize_cash_session_out(db, cash_session) if cash_session else None,
        top_products=[],
        top_beverages=[],
        historical_service_times=historical_service_times,
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
    return _order_balance_due(db, order) <= Decimal("0.00")


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
        .where(
            Order.store_id == store_id,
            Order.review_status == OrderReviewStatus.APPROVED.value,
            or_(
                Order.payment_gate != PaymentGate.BEFORE_PREPARATION.value,
                Order.payment_status == OrderPaymentStatus.CONFIRMED.value,
            ),
            filter_expr,
        )
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
                review_status=order.review_status,
                service_mode=order.service_mode,
                payment_gate=order.payment_gate,
                payment_status=order.payment_status,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item, order, table in rows
        ],
    )


@router.post("/orders/{order_id}/approve", response_model=ReviewOrderResponse)
def approve_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ReviewOrderResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    order = db.scalar(select(Order).where(Order.id == order_id, Order.store_id == current_staff.store_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.review_status == OrderReviewStatus.REJECTED.value:
        raise HTTPException(status_code=409, detail="Order was already rejected")
    if order.review_status == OrderReviewStatus.APPROVED.value:
        return ReviewOrderResponse(
            order_id=order.id,
            review_status=order.review_status,
            reviewed_by_staff_id=current_staff.id,
        )

    order.review_status = OrderReviewStatus.APPROVED.value
    order.updated_at = datetime.utcnow()
    db.add(order)
    db.commit()

    event_bus.publish(
        "items.changed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "item_sector": None,
            "item_status": OrderStatus.RECEIVED.value,
            "status_aggregated": order.status_aggregated,
            "reason": "order_approved",
        },
    )
    return ReviewOrderResponse(
        order_id=order.id,
        review_status=order.review_status,
        reviewed_by_staff_id=current_staff.id,
    )


@router.post("/orders/{order_id}/reject", response_model=ReviewOrderResponse)
def reject_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ReviewOrderResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    order = db.scalar(select(Order).where(Order.id == order_id, Order.store_id == current_staff.store_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.review_status == OrderReviewStatus.REJECTED.value:
        return ReviewOrderResponse(
            order_id=order.id,
            review_status=order.review_status,
            reviewed_by_staff_id=current_staff.id,
        )
    if order.payment_status == OrderPaymentStatus.CONFIRMED.value:
        raise HTTPException(status_code=409, detail="No se puede rechazar un pedido ya cobrado.")

    order.review_status = OrderReviewStatus.REJECTED.value
    order.updated_at = datetime.utcnow()
    db.add(order)

    split = get_latest_bill_split(db, order.id)
    if split and split.status != BillSplitStatus.CLOSED.value:
        split.status = BillSplitStatus.CLOSED.value
        split.closed_at = datetime.utcnow()
        db.add(split)

    pending_requests = db.scalars(
        select(TableSessionCashRequest).where(
            TableSessionCashRequest.order_id == order.id,
            TableSessionCashRequest.status == CashRequestStatus.PENDING.value,
        )
    ).all()
    for request in pending_requests:
        request.status = CashRequestStatus.RESOLVED.value
        request.resolved_at = datetime.utcnow()
        request.resolved_by_staff_id = current_staff.id
        db.add(request)

    db.commit()

    event_bus.publish(
        "items.changed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "item_sector": None,
            "item_status": OrderStatus.RECEIVED.value,
            "status_aggregated": order.status_aggregated,
            "reason": "order_rejected",
        },
    )
    return ReviewOrderResponse(
        order_id=order.id,
        review_status=order.review_status,
        reviewed_by_staff_id=current_staff.id,
    )


@router.post("/orders/{order_id}/confirm-bar-payment", response_model=ConfirmBarOrderPaymentResponse)
def confirm_bar_order_payment(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ConfirmBarOrderPaymentResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    order = db.scalar(select(Order).where(Order.id == order_id, Order.store_id == current_staff.store_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.review_status != OrderReviewStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="El pedido todavia no fue aceptado por staff.")
    if order.service_mode != ServiceMode.BAR.value:
        raise HTTPException(status_code=409, detail="Order is not BAR")
    if order.payment_gate != PaymentGate.BEFORE_PREPARATION.value:
        raise HTTPException(status_code=409, detail="Order does not require prepayment confirmation")
    if order.payment_status == OrderPaymentStatus.CONFIRMED.value:
        raise HTTPException(status_code=409, detail="BAR payment is already confirmed")

    split = get_latest_bill_split(db, order.id)
    if split and split.status != BillSplitStatus.CLOSED.value:
        split_parts = db.scalars(
            select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id)
        ).all()
        for part in split_parts:
            if part.payment_status != BillPartPaymentStatus.CONFIRMED.value:
                part.payment_status = BillPartPaymentStatus.CONFIRMED.value
            if not part.confirmed_at:
                part.confirmed_at = datetime.utcnow()
            if not part.confirmed_by_staff_id:
                part.confirmed_by_staff_id = current_staff.id
            db.add(part)
        split.status = BillSplitStatus.CLOSED.value
        split.closed_at = datetime.utcnow()
        db.add(split)

    order.payment_status = OrderPaymentStatus.CONFIRMED.value
    db.add(order)
    db.flush()
    event_bus.publish(
        "order.bar_payment_confirmed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "service_mode": order.service_mode,
            "payment_gate": order.payment_gate,
            "payment_status": order.payment_status,
            "confirmed_by_staff_id": current_staff.id,
        },
    )
    event_bus.publish(
        "items.changed",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "item_sector": None,
            "item_status": OrderStatus.RECEIVED.value,
            "status_aggregated": order.status_aggregated,
            "reason": "bar_payment_confirmed",
        },
    )
    db.commit()

    return ConfirmBarOrderPaymentResponse(
        order_id=order.id,
        review_status=order.review_status,
        service_mode=order.service_mode,
        payment_gate=order.payment_gate,
        payment_status=order.payment_status,
        confirmed_by_staff_id=current_staff.id,
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


@router.get("/store-settings/profile", response_model=StoreProfileResponse)
def get_store_profile_settings(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreProfileResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return _store_profile_out(store)


@router.get("/accounts", response_model=StaffAccountsResponse)
def list_staff_accounts(
    store_id: int,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffAccountsResponse:
    _require_owner_access(db, current_staff, owner_password)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    staff_items = db.scalars(
        select(StaffAccount)
        .where(StaffAccount.store_id == store_id)
        .order_by(StaffAccount.active.desc(), StaffAccount.display_name.asc(), StaffAccount.id.asc())
    ).all()
    return StaffAccountsResponse(items=[_staff_account_out(item) for item in staff_items])


@router.post("/accounts", response_model=StaffAccountOut, status_code=201)
def create_staff_account(
    payload: CreateStaffAccountRequest,
    store_id: int,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffAccountOut:
    _require_owner_access(db, current_staff, owner_password)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    username = payload.username.strip().lower()
    display_name = payload.display_name.strip()
    existing = db.scalar(
        select(StaffAccount).where(StaffAccount.store_id == store_id, StaffAccount.username == username)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Ese usuario ya existe en este local.")

    account = StaffAccount(
        store_id=store_id,
        sector=payload.sector,
        display_name=display_name,
        username=username,
        pin_hash=hash_pin(payload.pin.strip()),
        active=bool(payload.active),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _staff_account_out(account)


@router.patch("/accounts/{staff_id}", response_model=StaffAccountOut)
def update_staff_account(
    staff_id: int,
    payload: UpdateStaffAccountRequest,
    store_id: int,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffAccountOut:
    _require_owner_access(db, current_staff, owner_password)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    staff = db.scalar(select(StaffAccount).where(StaffAccount.id == staff_id, StaffAccount.store_id == store_id))
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    if payload.display_name is not None:
        staff.display_name = payload.display_name.strip()
    if payload.pin is not None and payload.pin.strip():
        staff.pin_hash = hash_pin(payload.pin.strip())
    if payload.active is not None:
        if staff.id == current_staff.id and payload.active is False:
            raise HTTPException(status_code=409, detail="No podés desactivar tu propia cuenta.")
        staff.active = bool(payload.active)

    db.add(staff)
    db.commit()
    db.refresh(staff)
    return _staff_account_out(staff)


@router.get("/store-settings/floor-plan", response_model=StoreFloorPlanResponse)
def get_store_floor_plan(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreFloorPlanResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    table_codes = _sorted_table_codes(db, store_id)
    return _normalize_floor_plan(store, table_codes)


@router.patch("/store-settings/floor-plan", response_model=StoreFloorPlanResponse)
def patch_store_floor_plan(
    payload: UpdateStoreFloorPlanRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreFloorPlanResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    normalized = _validated_floor_plan_payload(payload, _sorted_table_codes(db, store_id), store_id)
    store.floor_plan_json = normalized.model_dump_json()
    db.add(store)
    db.commit()
    db.refresh(store)
    event_bus.publish(
        "store.settings.updated",
        {
            "store_id": store.id,
            "floor_plan_updated": True,
        },
    )
    return normalized


@router.patch("/store-settings/profile", response_model=StoreProfileResponse)
def patch_store_profile_settings(
    payload: UpdateStoreProfileRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreProfileResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    _validate_owner_password(store, payload.owner_password)

    restaurant_name = payload.restaurant_name.strip()
    if not restaurant_name:
        raise HTTPException(status_code=422, detail="El nombre del restaurante es requerido.")

    logo_url = _optional_http_image_url(payload.logo_url, "Logo")
    cover_image_url = _optional_http_image_url(payload.cover_image_url, "Portada")
    theme_preset = (payload.theme_preset or "CLASSIC").strip().upper()
    accent_color = (payload.accent_color or "ROJO").strip().upper()
    background_color = (payload.background_color or "ROJO").strip().upper()
    background_image_url = _optional_http_image_url(payload.background_image_url, "Fondo")
    if theme_preset not in THEME_PRESETS:
        raise HTTPException(status_code=422, detail="Estilo no soportado.")
    if accent_color not in ACCENT_COLORS:
        raise HTTPException(status_code=422, detail="Color no soportado.")
    if background_color not in ACCENT_COLORS:
        raise HTTPException(status_code=422, detail="Color de fondo no soportado.")

    store.name = restaurant_name
    store.logo_url = logo_url
    store.cover_image_url = cover_image_url
    store.theme_preset = theme_preset
    store.accent_color = accent_color
    store.background_color = background_color
    store.background_image_url = background_image_url
    store.show_watermark_logo = bool(payload.show_watermark_logo)
    store.payment_cash_enabled = bool(payload.payment_cash_enabled)
    store.payment_transfer_enabled = bool(payload.payment_transfer_enabled)
    store.payment_card_enabled = bool(payload.payment_card_enabled)
    store.payment_mercado_pago_enabled = bool(payload.payment_mercado_pago_enabled)
    store.payment_modo_enabled = bool(payload.payment_modo_enabled)
    store.payment_transfer_instructions = (payload.payment_transfer_instructions or "").strip() or None
    if payload.new_owner_password is not None and payload.new_owner_password.strip():
        store.owner_password_hash = hash_pin(payload.new_owner_password.strip())
    db.add(store)
    db.commit()
    db.refresh(store)
    event_bus.publish(
        "store.settings.updated",
        {
            "store_id": store.id,
            "restaurant_name": store.name,
            "logo_url": store.logo_url,
            "cover_image_url": store.cover_image_url,
            "theme_preset": store.theme_preset,
            "accent_color": store.accent_color,
            "background_color": store.background_color,
            "background_image_url": store.background_image_url,
            "show_watermark_logo": bool(store.show_watermark_logo),
        },
    )
    return _store_profile_out(store)


@router.post("/store-settings/profile/theme-suggestion", response_model=StoreThemeSuggestionResponse)
def suggest_store_profile_theme(
    payload: StoreThemeSuggestionRequest,
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StoreThemeSuggestionResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    suggestion = suggest_store_theme(
        restaurant_name=payload.restaurant_name.strip(),
        logo_url=payload.logo_url,
        cover_image_url=payload.cover_image_url,
    )
    return StoreThemeSuggestionResponse(**suggestion)


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
        fallback_shift = _shift_for_open_cash_session(db, store_id)
        if not fallback_shift:
            return ActiveShiftResponse(active_shift=None, summary=_empty_shift_summary())
        return ActiveShiftResponse(
            active_shift=_serialize_shift(fallback_shift),
            summary=_build_shift_summary(db, shift=fallback_shift),
        )
    return ActiveShiftResponse(active_shift=_serialize_shift(shift), summary=_build_shift_summary(db, shift=shift))


@router.post("/shifts/bootstrap", response_model=ActiveShiftResponse)
def bootstrap_shift(
    payload: BootstrapShiftRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ActiveShiftResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    existing_shift = _latest_active_shift(db, store_id)
    if existing_shift:
        raise HTTPException(status_code=409, detail="Ya hay un turno abierto. Cerralo antes de abrir otro.")
    existing_cash = _current_cash_session(db, store_id)
    if existing_cash:
        raise HTTPException(status_code=409, detail="Ya hay una caja abierta. Cerrala antes de abrir otro turno.")

    shift = ServiceShift(
        store_id=store_id,
        label=payload.label.strip(),
        operator_name=current_staff.display_name,
        status="OPEN",
        opened_by_staff_id=current_staff.id,
    )
    db.add(shift)
    db.flush()

    cash_session = CashSession(
        store_id=store_id,
        service_shift_id=shift.id,
        status=CashSessionStatus.OPEN.value,
        opening_float=float(_money(payload.opening_float)),
        note=(payload.note or "").strip() or None,
        opened_by_staff_id=current_staff.id,
    )
    db.add(cash_session)
    db.commit()
    db.refresh(shift)
    return ActiveShiftResponse(active_shift=_serialize_shift(shift), summary=_build_shift_summary(db, shift=shift))


@router.post("/cash/open", response_model=CashSessionResponse)
def open_cash_session(
    payload: OpenCashSessionRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CashSessionResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    shift = _latest_active_shift(db, store_id)
    if not shift:
        raise HTTPException(status_code=409, detail="No hay turno abierto")

    existing = _current_cash_session(db, store_id)
    if existing:
        return CashSessionResponse(
            cash_session=_serialize_cash_session_out(db, existing),
            summary=_build_shift_summary(db, shift=shift),
        )
    previous = db.scalar(
        select(CashSession)
        .where(CashSession.service_shift_id == shift.id)
        .order_by(CashSession.opened_at.desc(), CashSession.id.desc())
        .limit(1)
    )
    if previous:
        return CashSessionResponse(
            cash_session=_serialize_cash_session_out(db, previous),
            summary=_build_shift_summary(db, shift=shift),
        )

    cash_session = CashSession(
        store_id=store_id,
        service_shift_id=shift.id,
        status=CashSessionStatus.OPEN.value,
        opening_float=float(_money(payload.opening_float)),
        note=(payload.note or "").strip() or None,
        opened_by_staff_id=current_staff.id,
    )
    db.add(cash_session)
    db.commit()
    db.refresh(cash_session)
    return CashSessionResponse(
        cash_session=_serialize_cash_session_out(db, cash_session),
        summary=_build_shift_summary(db, shift=shift),
    )


@router.post("/cash/close", response_model=CashSessionResponse)
def close_cash_session(
    payload: CloseCashSessionRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CashSessionResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    cash_session = _current_cash_session(db, store_id)
    if not cash_session:
        raise HTTPException(status_code=404, detail="No hay caja abierta")
    shift = _latest_active_shift(db, store_id)
    if not shift:
        shift = db.get(ServiceShift, cash_session.service_shift_id) if cash_session.service_shift_id else None
    if not shift:
        raise HTTPException(status_code=409, detail="No se pudo encontrar el turno asociado a la caja abierta")

    snapshot = _serialize_cash_session_out(db, cash_session)
    declared_amount = _money(payload.declared_amount)
    expected_amount = _money(snapshot.expected_amount)
    cash_session.status = CashSessionStatus.CLOSED.value
    cash_session.closed_by_staff_id = current_staff.id
    cash_session.closed_at = datetime.utcnow()
    cash_session.declared_amount = float(declared_amount)
    cash_session.difference_amount = float(declared_amount - expected_amount)
    cash_session.note = (payload.note or "").strip() or cash_session.note
    db.add(cash_session)
    db.commit()
    db.refresh(cash_session)
    return CashSessionResponse(
        cash_session=_serialize_cash_session_out(db, cash_session),
        summary=_build_shift_summary(db, shift=shift),
    )


@router.post("/payments/orders/{order_id}/collect", response_model=CollectOrderPaymentResponse)
def collect_order_payment(
    order_id: int,
    payload: CollectOrderPaymentRequest,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CollectOrderPaymentResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.store_id == current_staff.store_id)
        .options(joinedload(Order.items), joinedload(Order.table))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    cash_session = _current_cash_session(db, current_staff.store_id)
    if not cash_session:
        raise HTTPException(status_code=409, detail="Abrí una caja antes de registrar cobros.")

    due_before = _order_balance_due(db, order)
    amount = _money(payload.amount)
    if due_before <= Decimal("0.00"):
        raise HTTPException(status_code=409, detail="El pedido ya no tiene saldo pendiente.")
    if amount > due_before:
        raise HTTPException(status_code=409, detail=f"El saldo pendiente del pedido es {float(due_before):.2f}.")

    payment = PaymentRecord(
        store_id=order.store_id,
        order_id=order.id,
        table_session_id=order.table_session_id,
        cash_session_id=cash_session.id,
        payment_method=payload.payment_method,
        amount=float(amount),
        note=(payload.note or "").strip() or None,
        created_by_staff_id=current_staff.id,
    )
    db.add(payment)
    db.flush()
    total_paid = _order_paid_amount(db, order)
    balance_due = _order_balance_due(db, order)
    bar_payment_confirmed = _confirm_bar_payment_if_ready(db, order, current_staff=current_staff)
    db.commit()
    db.refresh(payment)
    db.refresh(order)

    event_bus.publish(
        "order.payment.collected",
        {
            "payment_id": payment.id,
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "table_code": order.table.code if order.table else "-",
            "payment_method": payment.payment_method,
            "amount": float(amount),
            "balance_due": float(balance_due),
            "payment_confirmed": balance_due <= Decimal("0.00"),
            "bar_payment_confirmed": bar_payment_confirmed,
        },
    )

    return CollectOrderPaymentResponse(
        order_id=order.id,
        payment_id=payment.id,
        payment_method=payment.payment_method,
        amount=float(amount),
        total_paid=float(total_paid),
        balance_due=float(balance_due),
        payment_confirmed=balance_due <= Decimal("0.00"),
    )


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
        operator_name=current_staff.display_name,
        status="OPEN",
        opened_by_staff_id=current_staff.id,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return ActiveShiftResponse(active_shift=_serialize_shift(shift), summary=_build_shift_summary(db, shift=shift))


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
    if summary.cash_session and summary.cash_session.status == CashSessionStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="Cerrá la caja antes de cerrar el turno.")

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


@router.get("/tables", response_model=StaffTablesResponse)
def list_staff_tables(
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StaffTablesResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    tables = db.scalars(
        select(Table)
        .where(Table.store_id == store_id, Table.active == True)
        .order_by(Table.code.asc(), Table.id.asc())
    ).all()

    items: list[StaffTableOut] = []
    now_utc = datetime.now(tz=timezone.utc)
    for table in tables:
        table_session = db.scalar(
            select(TableSession)
            .where(
                TableSession.store_id == store_id,
                TableSession.table_id == table.id,
                TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
            )
            .order_by(TableSession.created_at.desc(), TableSession.id.desc())
            .limit(1)
        )
        active_order = None
        connected_clients = 0
        elapsed_minutes = 0
        current_status = "LIBRE"

        if table_session:
            active_order = db.scalar(
                select(Order)
                .where(
                    Order.table_session_id == table_session.id,
                    Order.store_id == store_id,
                    Order.status_aggregated != OrderStatus.DELIVERED.value,
                    Order.review_status != OrderReviewStatus.REJECTED.value,
                )
                .order_by(Order.created_at.desc(), Order.id.desc())
                .limit(1)
            )
            connected_clients = int(
                db.scalar(
                    select(func.count()).select_from(TableSessionClient).where(TableSessionClient.table_session_id == table_session.id)
                )
                or 0
            )
            latest_client_seen_at = db.scalar(
                select(func.max(TableSessionClient.last_seen_at)).where(TableSessionClient.table_session_id == table_session.id)
            )
            elapsed_reference = max(
                [
                    candidate
                    for candidate in [
                        _as_utc(active_order.created_at) if active_order else None,
                        _as_utc(latest_client_seen_at),
                        _as_utc(table_session.created_at),
                    ]
                    if candidate is not None
                ],
                default=None,
            )
            elapsed_minutes = _minutes_since(elapsed_reference, now_utc)
            current_status = table_session.status

        items.append(
            StaffTableOut(
                table_id=table.id,
                table_code=table.code,
                active=bool(table.active),
                current_status=current_status,
                service_mode=(active_order.service_mode if active_order else (table_session.service_mode if table_session else "RESTAURANTE")),
                active_table_session_id=table_session.id if table_session else None,
                guest_count=int(table_session.guest_count or 0) if table_session else 0,
                connected_clients=connected_clients,
                active_order_id=int(active_order.id) if active_order else None,
                active_order_created_at=active_order.created_at if active_order else None,
                elapsed_minutes=elapsed_minutes,
            )
        )

    return StaffTablesResponse(total=len(items), items=items)


@router.post("/tables", response_model=CreateStaffTableResponse)
def create_staff_table(
    payload: CreateStaffTableRequest,
    store_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CreateStaffTableResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    requested_code = (payload.table_code or "").strip().upper()
    table_code = requested_code or _next_table_code(db, store_id)
    if len(table_code) > 30:
        raise HTTPException(status_code=422, detail="Codigo de mesa demasiado largo.")

    existing = db.scalar(select(Table).where(Table.store_id == store_id, Table.code == table_code))
    if existing:
        raise HTTPException(status_code=409, detail=f"La mesa {table_code} ya existe.")

    table = Table(store_id=store_id, code=table_code, active=True)
    db.add(table)
    db.commit()
    db.refresh(table)
    event_bus.publish(
        "store.tables.updated",
        {
            "store_id": store_id,
            "table_code": table.code,
        },
    )
    return CreateStaffTableResponse(table_id=table.id, table_code=table.code, active=bool(table.active))


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
            Order.review_status != OrderReviewStatus.REJECTED.value,
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
                Order.review_status != OrderReviewStatus.REJECTED.value,
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
                service_mode=(active_order.service_mode if active_order else (table_session.service_mode or "RESTAURANTE")),
                checkout_status=table_session.checkout_status or RESTAURANT_CHECKOUT_NONE,
                connected_clients=int(connected_clients or 0),
                active_order_id=int(active_order.id) if active_order else None,
                active_order_created_at=active_order.created_at if active_order else None,
                elapsed_minutes=elapsed_minutes,
                created_at=table_session.created_at,
            )
        )

    return StaffTableSessionsResponse(total=int(total), items=items)


@router.post("/table-sessions/{table_session_id}/enable-checkout", response_model=RestaurantCheckoutResponse)
def enable_restaurant_checkout(
    table_session_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> RestaurantCheckoutResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != current_staff.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    if table_session.service_mode != ServiceMode.RESTAURANTE.value:
        raise HTTPException(status_code=409, detail="Este paso solo aplica a restaurante.")
    if table_session.status not in ACTIVE_TABLE_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="La mesa ya esta cerrada.")
    if (table_session.checkout_status or RESTAURANT_CHECKOUT_NONE) != RESTAURANT_CHECKOUT_REQUESTED:
        raise HTTPException(status_code=409, detail="La cuenta todavia no fue solicitada por el cliente.")

    table_session.checkout_status = RESTAURANT_CHECKOUT_READY
    db.add(table_session)
    db.commit()

    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    event_bus.publish(
        "table.session.checkout_ready",
        {
            "table_session_id": table_session.id,
            "store_id": table_session.store_id,
            "table_code": table.code if table else "-",
            "checkout_status": table_session.checkout_status,
        },
    )
    return RestaurantCheckoutResponse(
        table_session_id=table_session.id,
        table_code=table.code if table else "-",
        checkout_status=table_session.checkout_status,
    )


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
    if not _latest_active_shift(db, current_staff.store_id):
        raise HTTPException(status_code=409, detail="No hay turno abierto. Un encargado debe abrir turno y caja primero.")

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


@router.post("/table-sessions/{table_session_id}/move", response_model=MoveTableSessionResponse)
def move_table_session(
    table_session_id: int,
    payload: MoveTableSessionRequest,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> MoveTableSessionResponse:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != current_staff.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    if table_session.status not in ACTIVE_TABLE_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="Table session is not active")

    origin_table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    if not origin_table:
        raise HTTPException(status_code=404, detail="Origin table not found")

    target_table_code = payload.target_table_code.strip().upper()
    target_table = db.scalar(
        select(Table).where(
            Table.store_id == current_staff.store_id,
            Table.code == target_table_code,
            Table.active == True,
        )
    )
    if not target_table:
        raise HTTPException(status_code=404, detail="Target table not found or inactive")
    if target_table.id == table_session.table_id:
        raise HTTPException(status_code=409, detail="Target table must be different from current table")

    target_active_session = db.scalar(
        select(TableSession)
        .where(
            TableSession.store_id == current_staff.store_id,
            TableSession.table_id == target_table.id,
            TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
        )
        .order_by(TableSession.created_at.desc(), TableSession.id.desc())
        .limit(1)
    )
    if target_active_session:
        raise HTTPException(status_code=409, detail=f"La mesa {target_table.code} ya esta ocupada.")

    moved_orders = db.scalars(
        select(Order)
        .where(Order.store_id == current_staff.store_id, Order.table_session_id == table_session.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
    ).all()

    table_session.table_id = target_table.id
    db.add(table_session)

    moved_order_ids: list[int] = []
    for order in moved_orders:
        order.table_id = target_table.id
        order.updated_at = datetime.utcnow()
        db.add(order)
        moved_order_ids.append(int(order.id))

    db.commit()
    db.refresh(table_session)

    event_bus.publish(
        "table.session.updated",
        {
            "table_session_id": table_session.id,
            "store_id": table_session.store_id,
            "table_code": target_table.code,
            "previous_table_code": origin_table.code,
            "guest_count": table_session.guest_count,
            "status": table_session.status,
            "active_order_id": moved_order_ids[0] if moved_order_ids else None,
            "reason": "table_moved",
        },
    )

    for order_id in moved_order_ids:
        event_bus.publish(
            "order.updated",
            {
                "order_id": order_id,
                "table_session_id": table_session.id,
                "store_id": table_session.store_id,
                "table_code": target_table.code,
                "previous_table_code": origin_table.code,
                "reason": "table_moved",
            },
        )

    return MoveTableSessionResponse(
        table_session_id=table_session.id,
        previous_table_code=origin_table.code,
        current_table_code=target_table.code,
        moved_order_ids=moved_order_ids,
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
        review_status=order.review_status,
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
                review_status=order.review_status,
                service_mode=order.service_mode,
                payment_gate=order.payment_gate,
                payment_status=order.payment_status,
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
    if not _latest_active_shift(db, current_staff.store_id):
        raise HTTPException(status_code=409, detail="No hay turno abierto. Un encargado debe abrir turno y caja primero.")
    if order.review_status != OrderReviewStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="El pedido todavia no fue aceptado por staff.")
    if (
        order.payment_gate == PaymentGate.BEFORE_PREPARATION.value
        and order.payment_status != OrderPaymentStatus.CONFIRMED.value
    ):
        raise HTTPException(
            status_code=409,
            detail="El pago debe quedar confirmado antes de cambiar estados de items.",
        )

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

    related_orders = db.scalars(
        select(Order)
        .where(Order.table_session_id == table_session.id, Order.store_id == current_staff.store_id)
        .options(joinedload(Order.items), joinedload(Order.table))
    ).unique().all()
    pending_balance = sum((_order_balance_due(db, order) for order in related_orders), Decimal("0.00"))
    if pending_balance > Decimal("0.00"):
        raise HTTPException(
            status_code=409,
            detail=f"La mesa {table.code} tiene saldo pendiente de {float(_money(pending_balance)):.2f}.",
        )

    _finalize_table_session_orders(db, table_session=table_session, staff_id=current_staff.id)

    table_session.status = TableSessionStatus.CLOSED.value
    table_session.checkout_status = RESTAURANT_CHECKOUT_NONE
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
        table_session.checkout_status = RESTAURANT_CHECKOUT_NONE
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
