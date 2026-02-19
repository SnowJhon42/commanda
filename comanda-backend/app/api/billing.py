from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_staff
from app.db.models import BillPartPaymentStatus, BillSplit, BillSplitPart, BillSplitStatus, Order, Sector, StaffAccount
from app.db.session import get_db
from app.schemas.orders import (
    BillSplitOut,
    CreateEqualBillSplitRequest,
    ReportBillPartPaymentRequest,
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
        db.add(
            BillSplitPart(
                bill_split_id=split.id,
                label=f"Persona {idx}",
                amount=float(amount),
                payment_status=BillPartPaymentStatus.PENDING.value,
                created_at=datetime.utcnow(),
            )
        )
    db.commit()
    db.refresh(split)

    event_bus.publish(
        "bill.split.updated",
        {
            "order_id": order.id,
            "table_session_id": order.table_session_id,
            "store_id": order.store_id,
            "bill_split_id": split.id,
            "status": split.status,
            "reason": "split_created",
        },
    )
    return to_bill_split_out(db, split)  # type: ignore[return-value]


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
        event_bus.publish(
            "bill.split.updated",
            {
                "order_id": order.id,
                "table_session_id": order.table_session_id,
                "store_id": order.store_id,
                "bill_split_id": split.id,
                "status": split.status,
                "reason": "payment_reported",
                "part_id": part.id,
            },
        )
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
        event_bus.publish(
            "bill.split.updated",
            {
                "order_id": order.id,
                "table_session_id": order.table_session_id,
                "store_id": order.store_id,
                "bill_split_id": split.id,
                "status": split.status,
                "reason": "payment_confirmed",
                "part_id": part.id,
            },
        )
    return to_bill_split_out(db, split)  # type: ignore[return-value]
