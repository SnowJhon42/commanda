from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Order, OrderSectorStatus, OrderStatus, OrderStatusEvent

VALID_TRANSITIONS = {
    OrderStatus.RECEIVED.value: OrderStatus.IN_PROGRESS.value,
    OrderStatus.IN_PROGRESS.value: OrderStatus.DONE.value,
    OrderStatus.DONE.value: OrderStatus.DELIVERED.value,
}


def assert_valid_transition(from_status: str, to_status: str) -> None:
    expected = VALID_TRANSITIONS.get(from_status)
    if expected != to_status:
        raise ValueError(f"Transition {from_status} -> {to_status} is not allowed")


def recompute_aggregated_status(db: Session, order_id: int) -> str:
    statuses = db.scalars(select(OrderSectorStatus.status).where(OrderSectorStatus.order_id == order_id)).all()
    if not statuses:
        return OrderStatus.RECEIVED.value
    if all(s == OrderStatus.RECEIVED.value for s in statuses):
        return OrderStatus.RECEIVED.value
    if all(s == OrderStatus.DELIVERED.value for s in statuses):
        return OrderStatus.DELIVERED.value
    if all(s == OrderStatus.DONE.value for s in statuses):
        return OrderStatus.DONE.value
    return OrderStatus.IN_PROGRESS.value


def change_sector_status(
    db: Session, *, order: Order, sector_status: OrderSectorStatus, to_status: str, changed_by_staff_id: int
) -> OrderSectorStatus:
    assert_valid_transition(sector_status.status, to_status)
    previous = sector_status.status
    sector_status.status = to_status
    sector_status.updated_by_staff_id = changed_by_staff_id
    sector_status.updated_at = datetime.utcnow()
    db.add(sector_status)
    db.add(
        OrderStatusEvent(
            order_id=order.id,
            sector=sector_status.sector,
            from_status=previous,
            to_status=to_status,
            changed_by_staff_id=changed_by_staff_id,
        )
    )
    order.status_aggregated = recompute_aggregated_status(db, order.id)
    db.add(order)
    return sector_status
