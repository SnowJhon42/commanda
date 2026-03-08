from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_staff
from app.db.models import (
    BillPartPaymentStatus,
    BillSplit,
    BillSplitPart,
    BillSplitStatus,
    CashRequestStatus,
    Order,
    OrderItem,
    Sector,
    StaffAccount,
    TableSessionCashRequest,
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


def _cash_request_out(req: TableSessionCashRequest) -> TableSessionCashRequestOut:
    return TableSessionCashRequestOut(
        id=req.id,
        table_session_id=req.table_session_id,
        order_id=req.order_id,
        client_id=req.client_id,
        payer_label=req.payer_label,
        note=req.note,
        status=req.status,
        created_at=req.created_at,
        resolved_at=req.resolved_at,
        resolved_by_staff_id=req.resolved_by_staff_id,
    )


@router.get("/orders/{order_id}/split", response_model=BillSplitOut)
def get_order_split(order_id: int, db: Session = Depends(get_db)) -> BillSplitOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    bill_split = get_latest_bill_split(db, order_id)
    if not bill_split:
        raise HTTPException(status_code=404, detail="Bill split not found")
    return to_bill_split_out(db, bill_split)  # type: ignore[return-value]


@router.post("/orders/{order_id}/split-equal", response_model=BillSplitOut)
def create_equal_split(
    order_id: int,
    payload: CreateEqualBillSplitRequest,
    db: Session = Depends(get_db),
) -> BillSplitOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

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
    db: Session = Depends(get_db),
) -> BillSplitOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

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
    db: Session = Depends(get_db),
) -> TableSessionCashRequestOut:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.table_session_id:
        raise HTTPException(status_code=409, detail="Order is not linked to table session")

    existing = db.scalar(
        select(TableSessionCashRequest)
        .where(
            TableSessionCashRequest.order_id == order_id,
            TableSessionCashRequest.client_id == payload.client_id,
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
        note=payload.note.strip() if payload.note else None,
        status=CashRequestStatus.PENDING.value,
        created_at=datetime.utcnow(),
    )
    db.add(cash_request)
    db.commit()
    db.refresh(cash_request)

    event_bus.publish(
        "bill.cash.requested",
        {
            "cash_request_id": cash_request.id,
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "payer_label": cash_request.payer_label,
        },
    )
    return _cash_request_out(cash_request)


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
    db.commit()
    db.refresh(cash_request)

    event_bus.publish(
        "bill.cash.resolved",
        {
            "cash_request_id": cash_request.id,
            "order_id": cash_request.order_id,
            "table_session_id": cash_request.table_session_id,
            "store_id": cash_request.store_id,
        },
    )
    return _cash_request_out(cash_request)


@router.post("/split-parts/{part_id}/report", response_model=BillSplitOut)
def report_part_payment(
    part_id: int,
    payload: ReportBillPartPaymentRequest,
    db: Session = Depends(get_db),
) -> BillSplitOut:
    part = db.scalar(select(BillSplitPart).where(BillSplitPart.id == part_id))
    if not part:
        raise HTTPException(status_code=404, detail="Bill split part not found")
    split = db.scalar(select(BillSplit).where(BillSplit.id == part.bill_split_id))
    if not split:
        raise HTTPException(status_code=404, detail="Bill split not found")
    if split.status != BillSplitStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="Bill split is closed")

    if part.payment_status == BillPartPaymentStatus.CONFIRMED.value:
        raise HTTPException(status_code=409, detail="Bill split part already confirmed")

    part.payment_status = BillPartPaymentStatus.REPORTED.value
    part.reported_by = payload.payer_label
    part.reported_at = datetime.utcnow()
    db.add(part)
    db.commit()

    order = db.scalar(select(Order).where(Order.id == split.order_id))
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

    part.payment_status = BillPartPaymentStatus.CONFIRMED.value
    part.confirmed_by_staff_id = current_staff.id
    part.confirmed_at = datetime.utcnow()
    db.add(part)

    maybe_close_bill_split(db, split)
    if split.status == BillSplitStatus.CLOSED.value:
        split.closed_at = datetime.utcnow()
    db.add(split)
    db.commit()

    order = db.scalar(select(Order).where(Order.id == split.order_id))
    if order:
        _publish_split_event(order, split, "payment_confirmed", part.id)
    return to_bill_split_out(db, split)  # type: ignore[return-value]
