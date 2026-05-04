from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import TableClientContext, get_current_staff, get_current_table_client
from app.db.models import (
    BillPartPaymentStatus,
    BillSplit,
    BillSplitPart,
    BillSplitStatus,
    CashRequestKind,
    CashRequestStatus,
    Order,
    OrderItem,
    OrderPaymentStatus,
    OrderReviewStatus,
    PaymentGate,
    Sector,
    ServiceMode,
    ServiceShift,
    StaffAccount,
    Store,
    Table,
    TableSessionCashRequest,
    TableSession,
    TableSessionStatus,
)
from app.db.session import get_db
from app.schemas.orders import (
    BillSplitOut,
    CreateConsumptionBillSplitRequest,
    CreateEqualBillSplitRequest,
    ReportBillPartPaymentRequest,
    RequestCashPaymentRequest,
    TableSessionCashRequestOut,
)
from app.services.billing import get_latest_bill_split, maybe_close_bill_split, to_bill_split_out
from app.services.realtime import event_bus

router = APIRouter(prefix="/billing", tags=["billing"])
ACTIVE_TABLE_SESSION_STATUSES = {
    TableSessionStatus.OPEN.value,
    TableSessionStatus.MESA_OCUPADA.value,
    TableSessionStatus.CON_PEDIDO.value,
}


def _order_total_amount(order: Order) -> Decimal:
    total = sum(Decimal(str(item.unit_price)) * Decimal(item.qty) for item in order.items)
    return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _build_equal_amounts(total: Decimal, parts_count: int) -> list[Decimal]:
    base = (total / Decimal(parts_count)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    amounts = [base for _ in range(parts_count)]
    diff = total - sum(amounts)
    amounts[-1] = (amounts[-1] + diff).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return amounts


def _publish_split_event(order: Order, split: BillSplit, reason: str, part_id: int | None = None) -> None:
    payload: dict[str, int | str | None] = {
        "order_id": order.id,
        "table_session_id": order.table_session_id,
        "store_id": order.store_id,
        "bill_split_id": split.id,
        "status": split.status,
        "reason": reason,
    }
    if part_id:
        payload["part_id"] = part_id
    event_bus.publish("bill.split.updated", payload)


def _latest_active_shift(db: Session, store_id: int) -> ServiceShift | None:
    return db.scalar(
        select(ServiceShift)
        .where(ServiceShift.store_id == store_id, ServiceShift.closed_at.is_(None))
        .order_by(ServiceShift.id.desc())
        .limit(1)
    )


def _order_payment_confirmed(db: Session, order: Order) -> bool:
    if order.review_status != OrderReviewStatus.APPROVED.value:
        return False
    total_amount = _order_total_amount(order)
    if total_amount <= Decimal("0.00"):
        return True

    split = get_latest_bill_split(db, order.id)
    if not split or split.status != BillSplitStatus.CLOSED.value:
        return False

    parts = db.scalars(select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id)).all()
    return bool(parts) and all(part.payment_status == BillPartPaymentStatus.CONFIRMED.value for part in parts)


def _order_fully_delivered(order: Order) -> bool:
    return bool(order.items) and all(item.status == "DELIVERED" for item in order.items)


def _restaurant_checkout_orders(db: Session, anchor_order: Order) -> list[Order]:
    if anchor_order.service_mode != ServiceMode.RESTAURANTE.value or not anchor_order.table_session_id:
        return [anchor_order]

    related_orders = db.scalars(
        select(Order)
        .where(
            Order.table_session_id == anchor_order.table_session_id,
            Order.store_id == anchor_order.store_id,
            Order.service_mode == ServiceMode.RESTAURANTE.value,
            Order.review_status == OrderReviewStatus.APPROVED.value,
        )
        .options(joinedload(Order.items))
        .order_by(Order.created_at.asc(), Order.id.asc())
    ).unique().all()
    return related_orders or [anchor_order]


def _maybe_auto_close_restaurant_session(db: Session, order: Order) -> dict[str, int | str | None] | None:
    if order.service_mode != ServiceMode.RESTAURANTE.value or not order.table_session_id:
        return None

    table_session = db.scalar(select(TableSession).where(TableSession.id == order.table_session_id))
    if not table_session or table_session.status == TableSessionStatus.CLOSED.value:
        return None

    related_orders = db.scalars(
        select(Order)
        .where(Order.table_session_id == table_session.id, Order.store_id == order.store_id)
        .options(joinedload(Order.items))
    ).unique().all()
    related_orders = [related_order for related_order in related_orders if related_order.review_status != OrderReviewStatus.REJECTED.value]
    if not related_orders:
        return None
    if any(related_order.service_mode != ServiceMode.RESTAURANTE.value for related_order in related_orders):
        return None
    if any(not _order_payment_confirmed(db, related_order) for related_order in related_orders):
        return None
    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    active_shift = _latest_active_shift(db, table_session.store_id)
    table_session.status = TableSessionStatus.CLOSED.value
    table_session.checkout_status = "NONE"
    table_session.closed_at = datetime.utcnow()
    table_session.closed_shift_id = active_shift.id if active_shift else None
    db.add(table_session)
    return {
        "table_session_id": table_session.id,
        "store_id": table_session.store_id,
        "table_code": table.code if table else order.table.code if order.table else None,
        "closed_at": table_session.closed_at.isoformat() if table_session.closed_at else None,
    }


def _confirm_restaurant_session_payment(
    db: Session,
    *,
    anchor_order: Order,
    current_staff: StaffAccount,
    payment_method: str | None = None,
    reported_by: str | None = None,
) -> tuple[list[tuple[Order, BillSplit]], dict[str, int | str | None] | None]:
    if anchor_order.service_mode != ServiceMode.RESTAURANTE.value:
        split, close_payload = _confirm_cash_order_payment(db, order=anchor_order, current_staff=current_staff)
        return [(anchor_order, split)], close_payload

    now = datetime.utcnow()
    confirmed: list[tuple[Order, BillSplit]] = []
    for related_order in _restaurant_checkout_orders(db, anchor_order):
        split = _ensure_open_single_split(db, related_order)
        parts = db.scalars(select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id)).all()
        if not parts:
            continue
        for part in parts:
            if payment_method:
                part.payment_method = payment_method
            if not part.reported_at:
                part.reported_at = now
            if reported_by and not part.reported_by:
                part.reported_by = reported_by
            part.payment_status = BillPartPaymentStatus.CONFIRMED.value
            part.confirmed_by_staff_id = current_staff.id
            part.confirmed_at = now
            db.add(part)
        split.status = BillSplitStatus.CLOSED.value
        split.closed_at = now
        db.add(split)
        related_order.payment_status = OrderPaymentStatus.CONFIRMED.value
        db.add(related_order)
        confirmed.append((related_order, split))

    close_payload = _maybe_auto_close_restaurant_session(db, anchor_order)
    return confirmed, close_payload


def _cash_request_out(req: TableSessionCashRequest) -> TableSessionCashRequestOut:
    return TableSessionCashRequestOut(
        id=req.id,
        table_session_id=req.table_session_id,
        order_id=req.order_id,
        client_id=req.client_id,
        payer_label=req.payer_label,
        request_kind=req.request_kind or CashRequestKind.CASH_PAYMENT.value,
        note=req.note,
        status=req.status,
        created_at=req.created_at,
        resolved_at=req.resolved_at,
        resolved_by_staff_id=req.resolved_by_staff_id,
    )


def _ensure_open_single_split(db: Session, order: Order) -> BillSplit:
    existing = get_latest_bill_split(db, order.id)
    if existing and existing.status == BillSplitStatus.OPEN.value:
        return existing

    total = _order_total_amount(order)
    if total <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")

    split = BillSplit(
        order_id=order.id,
        mode="EQUAL",
        status=BillSplitStatus.OPEN.value,
        total_amount=float(total),
        created_at=datetime.utcnow(),
    )
    db.add(split)
    db.flush()
    db.add(
        BillSplitPart(
            bill_split_id=split.id,
            label="Pago total",
            amount=float(total),
            payment_method="CASH",
            payment_status=BillPartPaymentStatus.PENDING.value,
            created_at=datetime.utcnow(),
        )
    )
    db.flush()
    return split


def _confirm_cash_order_payment(
    db: Session,
    *,
    order: Order,
    current_staff: StaffAccount,
) -> tuple[BillSplit, dict[str, int | str | None] | None]:
    split = _ensure_open_single_split(db, order)
    parts = db.scalars(select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id)).all()
    if not parts:
        raise HTTPException(status_code=400, detail="Bill split has no parts")

    now = datetime.utcnow()
    for part in parts:
        part.payment_method = "CASH"
        if not part.reported_at:
            part.reported_at = now
        if not part.reported_by:
            part.reported_by = "Cobro en efectivo"
        part.payment_status = BillPartPaymentStatus.CONFIRMED.value
        part.confirmed_by_staff_id = current_staff.id
        part.confirmed_at = now
        db.add(part)

    split.status = BillSplitStatus.CLOSED.value
    split.closed_at = now
    db.add(split)
    if order.payment_gate == PaymentGate.BEFORE_PREPARATION.value:
        order.payment_status = OrderPaymentStatus.CONFIRMED.value
        db.add(order)
    close_payload = _maybe_auto_close_restaurant_session(db, order)
    return split, close_payload


def _require_table_order_access(order: Order, table_client: TableClientContext) -> None:
    if not order.table_session_id:
        raise HTTPException(status_code=403, detail="Order is not linked to table session")
    if order.table_session_id != table_client.table_session_id or order.store_id != table_client.store_id:
        raise HTTPException(status_code=403, detail="Order does not belong to this table session")


@router.get("/orders/{order_id}/split", response_model=BillSplitOut)
def get_order_split(
    order_id: int,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> BillSplitOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_table_order_access(order, table_client)
    bill_split = get_latest_bill_split(db, order_id)
    if not bill_split:
        raise HTTPException(status_code=404, detail="Bill split not found")
    return to_bill_split_out(db, bill_split)  # type: ignore[return-value]


@router.post("/orders/{order_id}/split-equal", response_model=BillSplitOut)
def create_equal_split(
    order_id: int,
    payload: CreateEqualBillSplitRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> BillSplitOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_table_order_access(order, table_client)

    existing = get_latest_bill_split(db, order_id)
    if existing and existing.status == BillSplitStatus.OPEN.value:
        return to_bill_split_out(db, existing)  # type: ignore[return-value]

    total = _order_total_amount(order)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")

    split = BillSplit(
        order_id=order_id,
        mode="EQUAL",
        status=BillSplitStatus.OPEN.value,
        total_amount=float(total),
        created_at=datetime.utcnow(),
    )
    db.add(split)
    db.flush()

    for idx, amount in enumerate(_build_equal_amounts(total, payload.parts_count), start=1):
        label = "Pago total" if payload.parts_count == 1 else f"Persona {idx}"
        db.add(
            BillSplitPart(
                bill_split_id=split.id,
                label=label,
                amount=float(amount),
                payment_status=BillPartPaymentStatus.PENDING.value,
                created_at=datetime.utcnow(),
            )
        )
    db.commit()
    db.refresh(split)
    _publish_split_event(order, split, "split_created")
    return to_bill_split_out(db, split)  # type: ignore[return-value]


@router.post("/orders/{order_id}/split-consumption", response_model=BillSplitOut)
def create_consumption_split(
    order_id: int,
    payload: CreateConsumptionBillSplitRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> BillSplitOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_table_order_access(order, table_client)

    existing = get_latest_bill_split(db, order_id)
    if existing and existing.status == BillSplitStatus.OPEN.value:
        return to_bill_split_out(db, existing)  # type: ignore[return-value]

    items = db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()
    if not items:
        raise HTTPException(status_code=400, detail="Order has no items")

    grouped: dict[str, Decimal] = {}
    for item in items:
        owner = (item.created_by_client_id or "").strip() or "__shared__"
        line_total = (Decimal(str(item.unit_price)) * Decimal(item.qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        grouped[owner] = (grouped.get(owner, Decimal("0.00")) + line_total).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    total = sum(grouped.values(), Decimal("0.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than zero")

    split = BillSplit(
        order_id=order_id,
        mode="CONSUMPTION",
        status=BillSplitStatus.OPEN.value,
        total_amount=float(total),
        created_at=datetime.utcnow(),
    )
    db.add(split)
    db.flush()

    for key, amount in sorted(grouped.items(), key=lambda row: row[0]):
        label = payload.fallback_label if key == "__shared__" else f"Cliente {key[-6:]}"
        db.add(
            BillSplitPart(
                bill_split_id=split.id,
                label=label,
                amount=float(amount),
                payment_status=BillPartPaymentStatus.PENDING.value,
                created_at=datetime.utcnow(),
            )
        )
    db.commit()
    db.refresh(split)
    _publish_split_event(order, split, "split_created_consumption")
    return to_bill_split_out(db, split)  # type: ignore[return-value]


@router.post("/orders/{order_id}/request-cash", response_model=TableSessionCashRequestOut)
def request_cash_payment(
    order_id: int,
    payload: RequestCashPaymentRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> TableSessionCashRequestOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_table_order_access(order, table_client)
    if order.review_status != OrderReviewStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="El staff todavia no acepto este pedido.")
    if payload.client_id != table_client.client_id:
        raise HTTPException(status_code=403, detail="Cash request token does not match this client")
    if not order.table_session_id:
        raise HTTPException(status_code=409, detail="Order is not linked to table session")

    request_kind = payload.request_kind or CashRequestKind.CASH_PAYMENT.value

    normalized_note = payload.note.strip() if payload.note else None

    # Waiter call is an operational alert and should be re-emittable each tap.
    # Payment handoff requests stay unique while pending for the same pedido + medio.
    if request_kind != CashRequestKind.WAITER_CALL.value:
        existing = db.scalar(
            select(TableSessionCashRequest)
            .where(
                TableSessionCashRequest.order_id == order_id,
                TableSessionCashRequest.client_id == payload.client_id,
                TableSessionCashRequest.request_kind == request_kind,
                TableSessionCashRequest.note == normalized_note,
                TableSessionCashRequest.status == CashRequestStatus.PENDING.value,
            )
            .order_by(TableSessionCashRequest.id.desc())
            .limit(1)
        )
        if existing:
            return _cash_request_out(existing)

    cash_request = TableSessionCashRequest(
        table_session_id=order.table_session_id,
        order_id=order.id,
        store_id=order.store_id,
        client_id=payload.client_id,
        payer_label=payload.payer_label.strip(),
        request_kind=request_kind,
        note=normalized_note,
        status=CashRequestStatus.PENDING.value,
        created_at=datetime.utcnow(),
    )
    db.add(cash_request)
    db.commit()
    db.refresh(cash_request)

    table_code = db.scalar(select(Table.code).where(Table.id == order.table_id)) or "-"
    event_bus.publish(
        "bill.cash.requested",
        {
            "cash_request_id": cash_request.id,
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "table_code": table_code,
            "payer_label": cash_request.payer_label,
            "request_kind": cash_request.request_kind,
        },
    )
    return _cash_request_out(cash_request)


@router.post("/table-sessions/{table_session_id}/request-waiter", response_model=TableSessionCashRequestOut)
def request_waiter_help(
    table_session_id: int,
    payload: RequestCashPaymentRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> TableSessionCashRequestOut:
    if table_client.table_session_id != table_session_id or table_client.client_id != payload.client_id:
        raise HTTPException(status_code=403, detail="Waiter request token does not match this session")
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != table_client.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    if table_session.status not in ACTIVE_TABLE_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="Table session is closed")

    latest_order = db.scalar(
        select(Order)
        .where(
            Order.table_session_id == table_session.id,
            Order.store_id == table_session.store_id,
            Order.review_status != OrderReviewStatus.REJECTED.value,
        )
        .order_by(Order.id.desc())
        .limit(1)
    )

    cash_request = TableSessionCashRequest(
        table_session_id=table_session.id,
        order_id=latest_order.id if latest_order else None,
        store_id=table_session.store_id,
        client_id=payload.client_id,
        payer_label=payload.payer_label.strip(),
        request_kind=CashRequestKind.WAITER_CALL.value,
        note=payload.note.strip() if payload.note else None,
        status=CashRequestStatus.PENDING.value,
        created_at=datetime.utcnow(),
    )
    db.add(cash_request)
    db.commit()
    db.refresh(cash_request)

    table_code = db.scalar(select(Table.code).where(Table.id == table_session.table_id)) or "-"
    event_bus.publish(
        "bill.cash.requested",
        {
            "cash_request_id": cash_request.id,
            "order_id": cash_request.order_id,
            "table_session_id": cash_request.table_session_id,
            "store_id": cash_request.store_id,
            "table_code": table_code,
            "payer_label": cash_request.payer_label,
            "request_kind": cash_request.request_kind,
        },
    )
    return _cash_request_out(cash_request)


@router.get("/table-sessions/{table_session_id}/cash-requests", response_model=list[TableSessionCashRequestOut])
def list_table_session_cash_requests(
    table_session_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> list[TableSessionCashRequestOut]:
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != current_staff.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    requests = db.scalars(
        select(TableSessionCashRequest)
        .where(TableSessionCashRequest.table_session_id == table_session_id)
        .order_by(TableSessionCashRequest.created_at.desc(), TableSessionCashRequest.id.desc())
        .limit(40)
    ).all()
    return [_cash_request_out(req) for req in requests]


@router.post("/cash-requests/{cash_request_id}/resolve", response_model=TableSessionCashRequestOut)
def resolve_cash_payment_request(
    cash_request_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> TableSessionCashRequestOut:
    if current_staff.sector not in {Sector.ADMIN.value, Sector.WAITER.value}:
        raise HTTPException(status_code=403, detail="Admin or waiter only")

    cash_request = db.scalar(select(TableSessionCashRequest).where(TableSessionCashRequest.id == cash_request_id))
    if not cash_request:
        raise HTTPException(status_code=404, detail="Cash request not found")
    if cash_request.store_id != current_staff.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    if cash_request.status == CashRequestStatus.RESOLVED.value:
        return _cash_request_out(cash_request)

    cash_request.status = CashRequestStatus.RESOLVED.value
    cash_request.resolved_by_staff_id = current_staff.id
    cash_request.resolved_at = datetime.utcnow()
    db.add(cash_request)

    split = None
    close_payload = None
    order = None
    confirmed_restaurant_orders: list[tuple[Order, BillSplit]] = []
    if cash_request.order_id and cash_request.request_kind == CashRequestKind.CASH_PAYMENT.value:
        order = db.scalar(select(Order).where(Order.id == cash_request.order_id).options(joinedload(Order.table)))
        if order:
            if order.service_mode == ServiceMode.RESTAURANTE.value:
                confirmed_restaurant_orders, close_payload = _confirm_restaurant_session_payment(
                    db,
                    anchor_order=order,
                    current_staff=current_staff,
                    payment_method="CASH",
                    reported_by="Cobro en efectivo",
                )
                split = confirmed_restaurant_orders[0][1] if confirmed_restaurant_orders else None
            else:
                split, close_payload = _confirm_cash_order_payment(db, order=order, current_staff=current_staff)

    db.commit()
    db.refresh(cash_request)

    table_code = db.scalar(
        select(Table.code)
        .join(TableSession, TableSession.table_id == Table.id)
        .where(TableSession.id == cash_request.table_session_id)
    ) or "-"
    event_bus.publish(
        "bill.cash.resolved",
        {
            "cash_request_id": cash_request.id,
            "order_id": cash_request.order_id,
            "table_session_id": cash_request.table_session_id,
            "store_id": cash_request.store_id,
            "table_code": table_code,
            "request_kind": cash_request.request_kind,
        },
    )
    if confirmed_restaurant_orders:
        for confirmed_order, confirmed_split in confirmed_restaurant_orders:
            _publish_split_event(confirmed_order, confirmed_split, "cash_payment_confirmed")
    elif order and split:
        _publish_split_event(order, split, "cash_payment_confirmed")
    if close_payload:
        event_bus.publish("table.session.closed", close_payload)
    return _cash_request_out(cash_request)


@router.post("/split-parts/{part_id}/report", response_model=BillSplitOut)
def report_part_payment(
    part_id: int,
    payload: ReportBillPartPaymentRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> BillSplitOut:
    part = db.scalar(select(BillSplitPart).where(BillSplitPart.id == part_id))
    if not part:
        raise HTTPException(status_code=404, detail="Bill split part not found")
    split = db.scalar(select(BillSplit).where(BillSplit.id == part.bill_split_id))
    if not split:
        raise HTTPException(status_code=404, detail="Bill split not found")
    order = db.scalar(select(Order).where(Order.id == split.order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_table_order_access(order, table_client)
    if order.review_status != OrderReviewStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="El staff todavia no acepto este pedido.")
    if split.status != BillSplitStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="Bill split is closed")

    if part.payment_status == BillPartPaymentStatus.CONFIRMED.value:
        raise HTTPException(status_code=409, detail="Bill split part already confirmed")

    part.payment_method = payload.payment_method or "OTHER"
    part.payment_status = BillPartPaymentStatus.REPORTED.value
    part.reported_by = payload.payer_label
    part.reported_at = datetime.utcnow()
    db.add(part)
    db.commit()

    if order:
        _publish_split_event(order, split, "payment_reported", part.id)
    return to_bill_split_out(db, split)  # type: ignore[return-value]


@router.post("/split-parts/{part_id}/confirm", response_model=BillSplitOut)
def confirm_part_payment(
    part_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> BillSplitOut:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    part = db.scalar(select(BillSplitPart).where(BillSplitPart.id == part_id))
    if not part:
        raise HTTPException(status_code=404, detail="Bill split part not found")
    split = db.scalar(select(BillSplit).where(BillSplit.id == part.bill_split_id))
    if not split:
        raise HTTPException(status_code=404, detail="Bill split not found")
    if split.status != BillSplitStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="Bill split is closed")
    if part.payment_status != BillPartPaymentStatus.REPORTED.value:
        raise HTTPException(status_code=409, detail="Bill split part must be reported first")

    order = db.scalar(select(Order).where(Order.id == split.order_id).options(joinedload(Order.table)))
    confirmed_restaurant_orders: list[tuple[Order, BillSplit]] = []
    close_payload = None
    if order and order.service_mode == ServiceMode.RESTAURANTE.value:
        confirmed_restaurant_orders, close_payload = _confirm_restaurant_session_payment(
            db,
            anchor_order=order,
            current_staff=current_staff,
            payment_method=part.payment_method or "OTHER",
            reported_by=part.reported_by,
        )
    else:
        part.payment_status = BillPartPaymentStatus.CONFIRMED.value
        part.confirmed_by_staff_id = current_staff.id
        part.confirmed_at = datetime.utcnow()
        db.add(part)

        maybe_close_bill_split(db, split)
        if split.status == BillSplitStatus.CLOSED.value:
            split.closed_at = datetime.utcnow()
        db.add(split)
        if order and order.payment_gate == PaymentGate.BEFORE_PREPARATION.value:
            order.payment_status = OrderPaymentStatus.CONFIRMED.value
            db.add(order)
        close_payload = _maybe_auto_close_restaurant_session(db, order) if order else None
    db.commit()

    if confirmed_restaurant_orders:
        for confirmed_order, confirmed_split in confirmed_restaurant_orders:
            _publish_split_event(confirmed_order, confirmed_split, "payment_confirmed", part.id)
    elif order:
        _publish_split_event(order, split, "payment_confirmed", part.id)
    if close_payload:
        event_bus.publish("table.session.closed", close_payload)
    return to_bill_split_out(db, split)  # type: ignore[return-value]


@router.post("/orders/{order_id}/force-confirm", response_model=BillSplitOut)
def force_confirm_order_payment(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> BillSplitOut:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")

    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.review_status != OrderReviewStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="El staff todavia no acepto este pedido.")

    split = get_latest_bill_split(db, order_id)
    if not split:
        total = _order_total_amount(order)
        if total <= 0:
            raise HTTPException(status_code=400, detail="Order total must be greater than zero")
        split = BillSplit(
            order_id=order_id,
            mode="FORCED",
            status=BillSplitStatus.OPEN.value,
            total_amount=float(total),
            created_at=datetime.utcnow(),
        )
        db.add(split)
        db.flush()
        db.add(
            BillSplitPart(
                bill_split_id=split.id,
                label="Pago total",
                amount=float(total),
                payment_status=BillPartPaymentStatus.PENDING.value,
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
        db.refresh(split)

    parts = db.scalars(select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id)).all()
    if not parts:
        raise HTTPException(status_code=400, detail="Bill split has no parts")

    order = db.scalar(select(Order).where(Order.id == order_id))
    confirmed_restaurant_orders: list[tuple[Order, BillSplit]] = []
    close_payload = None
    if order and order.service_mode == ServiceMode.RESTAURANTE.value:
        confirmed_restaurant_orders, close_payload = _confirm_restaurant_session_payment(
            db,
            anchor_order=order,
            current_staff=current_staff,
            payment_method="OTHER",
            reported_by="Confirmado por staff",
        )
    else:
        for part in parts:
            if part.payment_status != BillPartPaymentStatus.CONFIRMED.value:
                part.payment_status = BillPartPaymentStatus.CONFIRMED.value
                part.confirmed_by_staff_id = current_staff.id
                part.confirmed_at = datetime.utcnow()
                db.add(part)

        split.status = BillSplitStatus.CLOSED.value
        split.closed_at = datetime.utcnow()
        db.add(split)
        if order and order.payment_gate == PaymentGate.BEFORE_PREPARATION.value:
            order.payment_status = OrderPaymentStatus.CONFIRMED.value
            db.add(order)
        close_payload = _maybe_auto_close_restaurant_session(db, order) if order else None
    if confirmed_restaurant_orders:
        for confirmed_order, confirmed_split in confirmed_restaurant_orders:
            _publish_split_event(confirmed_order, confirmed_split, "forced_payment_confirmed")
    elif order:
        _publish_split_event(order, split, "forced_payment_confirmed")
    db.commit()
    db.refresh(split)
    if close_payload:
        event_bus.publish("table.session.closed", close_payload)
    return to_bill_split_out(db, split)
