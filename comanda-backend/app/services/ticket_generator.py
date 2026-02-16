from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Order


def next_ticket_number(db: Session, store_id: int) -> int:
    current_max = db.scalar(select(func.max(Order.ticket_number)).where(Order.store_id == store_id))
    return 1 if current_max is None else current_max + 1
