from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import BillPartPaymentStatus, BillSplit, BillSplitPart, BillSplitStatus, Order
from app.schemas.orders import BillSplitOut, BillSplitPartOut


def get_latest_bill_split(db: Session, order_id: int) -> BillSplit | None:
    return db.scalar(
        select(BillSplit)
        .where(BillSplit.order_id == order_id)
        .order_by(BillSplit.created_at.desc(), BillSplit.id.desc())
        .limit(1)
    )


def to_bill_split_out(db: Session, bill_split: BillSplit | None) -> BillSplitOut | None:
    if not bill_split:
        return None
    parts = db.scalars(
        select(BillSplitPart).where(BillSplitPart.bill_split_id == bill_split.id).order_by(BillSplitPart.id.asc())
    ).all()
    return BillSplitOut(
        id=bill_split.id,
        order_id=bill_split.order_id,
        mode=bill_split.mode,
        status=bill_split.status,
        total_amount=float(bill_split.total_amount),
        created_at=bill_split.created_at,
        closed_at=bill_split.closed_at,
        parts=[
            BillSplitPartOut(
                id=part.id,
                label=part.label,
                amount=float(part.amount),
                payment_method=part.payment_method,
                payment_status=part.payment_status,
                reported_by=part.reported_by,
                reported_at=part.reported_at,
                confirmed_by_staff_id=part.confirmed_by_staff_id,
                confirmed_at=part.confirmed_at,
            )
            for part in parts
        ],
    )


def maybe_close_bill_split(db: Session, bill_split: BillSplit) -> BillSplit:
    parts = db.scalars(select(BillSplitPart).where(BillSplitPart.bill_split_id == bill_split.id)).all()
    if parts and all(part.payment_status == "CONFIRMED" for part in parts):
        bill_split.status = BillSplitStatus.CLOSED.value
    return bill_split


def _quantize_amount(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _build_equal_amounts(total: Decimal, parts_count: int) -> list[Decimal]:
    base = _quantize_amount(total / Decimal(parts_count))
    amounts = [base for _ in range(parts_count)]
    diff = total - sum(amounts)
    amounts[-1] = _quantize_amount(amounts[-1] + diff)
    return amounts


def sync_open_split_to_order_total(db: Session, order: Order) -> BillSplit | None:
    split = get_latest_bill_split(db, order.id)
    if not split:
        return None
    if split.status == BillSplitStatus.CLOSED.value:
        previous_parts = db.scalars(
            select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id).order_by(BillSplitPart.id.asc())
        ).all()
        part_count = max(1, len(previous_parts))
        total = _quantize_amount(
            sum((Decimal(str(item.unit_price)) * Decimal(item.qty) for item in order.items), Decimal("0.00"))
        )
        reopened = BillSplit(
            order_id=order.id,
            mode=split.mode,
            status=BillSplitStatus.OPEN.value,
            total_amount=float(total),
            created_at=datetime.utcnow(),
        )
        db.add(reopened)
        db.flush()
        for idx, amount in enumerate(_build_equal_amounts(total, part_count), start=1):
            label = (
                previous_parts[idx - 1].label
                if idx - 1 < len(previous_parts) and previous_parts[idx - 1].label
                else ("Pago total" if part_count == 1 else f"Persona {idx}")
            )
            db.add(
                BillSplitPart(
                    bill_split_id=reopened.id,
                    label=label,
                    amount=float(amount),
                    payment_method="OTHER",
                    payment_status=BillPartPaymentStatus.PENDING.value,
                    created_at=datetime.utcnow(),
                )
            )
        return reopened
    if split.status != BillSplitStatus.OPEN.value:
        return None

    parts = db.scalars(
        select(BillSplitPart).where(BillSplitPart.bill_split_id == split.id).order_by(BillSplitPart.id.asc())
    ).all()
    if not parts:
        return split

    total = _quantize_amount(
        sum((Decimal(str(item.unit_price)) * Decimal(item.qty) for item in order.items), Decimal("0.00"))
    )
    split.total_amount = float(total)
    split.closed_at = None
    split.status = BillSplitStatus.OPEN.value
    db.add(split)

    if len(parts) == 1:
        parts[0].amount = float(total)
        parts[0].payment_method = "OTHER"
        parts[0].payment_status = BillPartPaymentStatus.PENDING.value
        parts[0].reported_by = None
        parts[0].reported_at = None
        parts[0].confirmed_by_staff_id = None
        parts[0].confirmed_at = None
        db.add(parts[0])
        return split

    for part, amount in zip(parts, _build_equal_amounts(total, len(parts))):
        part.amount = float(amount)
        part.payment_method = "OTHER"
        part.payment_status = BillPartPaymentStatus.PENDING.value
        part.reported_by = None
        part.reported_at = None
        part.confirmed_by_staff_id = None
        part.confirmed_at = None
        db.add(part)

    return split
