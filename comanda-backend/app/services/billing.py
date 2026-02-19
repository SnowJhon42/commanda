from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import BillSplit, BillSplitPart, BillSplitStatus
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
