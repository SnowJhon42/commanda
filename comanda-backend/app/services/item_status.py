from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import ItemStatusEvent, Order, OrderItem, OrderStatus, Sector, StaffAccount

ORDER_STATUS_PARTIAL = "PARCIAL"


def _assert_known_status(status: str) -> None:
    valid = {
        OrderStatus.RECEIVED.value,
        OrderStatus.IN_PROGRESS.value,
        OrderStatus.DONE.value,
        OrderStatus.DELIVERED.value,
    }
    if status not in valid:
        raise ValueError(f"Invalid status: {status}")


def recompute_order_status_from_items(db: Session, order_id: int) -> str:
    statuses = db.scalars(select(OrderItem.status).where(OrderItem.order_id == order_id)).all()
    if not statuses:
        return OrderStatus.RECEIVED.value

    if all(status == OrderStatus.DELIVERED.value for status in statuses):
        return OrderStatus.DELIVERED.value
    if any(status == OrderStatus.IN_PROGRESS.value for status in statuses):
        return OrderStatus.IN_PROGRESS.value
    if all(status == OrderStatus.DONE.value for status in statuses):
        return OrderStatus.DONE.value
    if any(status == OrderStatus.DELIVERED.value for status in statuses):
        return ORDER_STATUS_PARTIAL
    if all(status == OrderStatus.RECEIVED.value for status in statuses):
        return OrderStatus.RECEIVED.value
    return OrderStatus.IN_PROGRESS.value


def _is_transition_allowed(*, item_sector: str, from_status: str, to_status: str, actor_sector: str) -> bool:
    _assert_known_status(from_status)
    _assert_known_status(to_status)

    if actor_sector == Sector.ADMIN.value:
        if item_sector == Sector.WAITER.value and from_status == OrderStatus.RECEIVED.value:
            return to_status == OrderStatus.DELIVERED.value
        if from_status == OrderStatus.RECEIVED.value:
            return to_status == OrderStatus.IN_PROGRESS.value
        if from_status == OrderStatus.IN_PROGRESS.value:
            return to_status == OrderStatus.DONE.value
        if from_status == OrderStatus.DONE.value:
            return to_status == OrderStatus.DELIVERED.value
        return False

    if actor_sector == Sector.KITCHEN.value:
        return item_sector == Sector.KITCHEN.value and from_status == OrderStatus.IN_PROGRESS.value and to_status == OrderStatus.DONE.value

    if actor_sector == Sector.BAR.value:
        return item_sector == Sector.BAR.value and from_status == OrderStatus.IN_PROGRESS.value and to_status == OrderStatus.DONE.value

    if actor_sector == Sector.WAITER.value:
        if item_sector == Sector.WAITER.value and from_status == OrderStatus.RECEIVED.value:
            return to_status == OrderStatus.DELIVERED.value
        if from_status == OrderStatus.DONE.value:
            return to_status == OrderStatus.DELIVERED.value
        return False

    return False


def change_item_status(
    db: Session, *, item: OrderItem, to_status: str, current_staff: StaffAccount
) -> tuple[OrderItem, str, str]:
    from_status = item.status
    if not _is_transition_allowed(
        item_sector=item.sector,
        from_status=from_status,
        to_status=to_status,
        actor_sector=current_staff.sector,
    ):
        raise ValueError(f"Transition {from_status} -> {to_status} is not allowed for role {current_staff.sector}")

    item.status = to_status
    item.updated_at = datetime.utcnow()
    db.add(item)
    db.add(
        ItemStatusEvent(
            item_id=item.id,
            order_id=item.order_id,
            sector=item.sector,
            from_status=from_status,
            to_status=to_status,
            changed_by_staff_id=current_staff.id,
        )
    )
    db.flush()

    order_status = recompute_order_status_from_items(db, item.order_id)
    db.execute(
        update(Order)
        .where(Order.id == item.order_id)
        .values(status_aggregated=order_status, updated_at=datetime.utcnow())
    )
    return item, from_status, order_status
