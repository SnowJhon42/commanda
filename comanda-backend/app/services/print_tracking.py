from datetime import datetime

from app.db.models import Order

PRINT_TARGETS = {"FULL", "COMMANDS", "KITCHEN", "BAR", "WAITER"}
SECTOR_TARGETS = ("KITCHEN", "BAR", "WAITER")


def _sector_printed_at(order: Order, sector: str):
    if sector == "KITCHEN":
        return order.printed_kitchen_at
    if sector == "BAR":
        return order.printed_bar_at
    if sector == "WAITER":
        return order.printed_waiter_at
    return None


def mark_order_print_target(order: Order, target: str) -> list[str]:
    normalized = (target or "").strip().upper()
    if normalized not in PRINT_TARGETS:
        raise ValueError("Unsupported print target")

    now = datetime.utcnow()
    touched: list[str] = []
    if normalized == "FULL":
        order.printed_full_at = now
        return ["FULL"]

    present_sectors = {item.sector for item in order.items}
    if normalized == "COMMANDS":
        for sector in SECTOR_TARGETS:
            if sector in present_sectors:
                touched.extend(mark_order_print_target(order, sector))
        return touched

    if normalized == "KITCHEN":
        if "KITCHEN" in present_sectors:
            order.printed_kitchen_at = now
            touched.append("KITCHEN")
        return touched
    if normalized == "BAR":
        if "BAR" in present_sectors:
            order.printed_bar_at = now
            touched.append("BAR")
        return touched
    if normalized == "WAITER":
        if "WAITER" in present_sectors:
            order.printed_waiter_at = now
            touched.append("WAITER")
        return touched
    return touched


def build_order_print_status(order: Order) -> dict:
    present_sectors = sorted({item.sector for item in order.items if item.sector in SECTOR_TARGETS})
    latest_order_item_at = max((item.created_at for item in order.items), default=None)
    full_status = (
        "PRINTED"
        if order.printed_full_at and latest_order_item_at and order.printed_full_at >= latest_order_item_at
        else "PENDING"
    )

    sectors = []
    required_sector_count = 0
    printed_sector_count = 0
    for sector in SECTOR_TARGETS:
        printed_at = _sector_printed_at(order, sector)
        required = sector in present_sectors
        latest_sector_item_at = max((item.created_at for item in order.items if item.sector == sector), default=None)
        sector_is_printed = bool(printed_at and latest_sector_item_at and printed_at >= latest_sector_item_at)
        if required:
            required_sector_count += 1
            if sector_is_printed:
                printed_sector_count += 1
        sectors.append(
            {
                "sector": sector,
                "required": required,
                "status": "PRINTED" if sector_is_printed else ("PENDING" if required else "NOT_APPLICABLE"),
                "printed_at": printed_at,
            }
        )

    commands_printed = required_sector_count > 0 and printed_sector_count == required_sector_count
    commands_status = "PRINTED" if commands_printed else ("PENDING" if required_sector_count > 0 else "NOT_APPLICABLE")

    if full_status == "PRINTED" and commands_status in {"PRINTED", "NOT_APPLICABLE"}:
        overall_status = "TOTAL"
    elif full_status == "PENDING" and printed_sector_count == 0:
        overall_status = "NONE"
    else:
        overall_status = "PARTIAL"

    return {
        "overall_status": overall_status,
        "full_status": full_status,
        "full_printed_at": order.printed_full_at,
        "commands_status": commands_status,
        "sectors": sectors,
    }
