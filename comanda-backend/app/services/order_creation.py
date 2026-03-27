from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Order, OrderItem, OrderStatus, Product, ProductExtraOption, ProductVariant
from app.services.order_routing import route_item_to_sector


def add_items_to_order(
    db: Session,
    *,
    store_id: int,
    order: Order,
    items: list,
    client_id: str | None = None,
) -> set[str]:
    sectors_present = {row[0] for row in db.execute(select(OrderItem.sector).where(OrderItem.order_id == order.id)).all()}

    for raw_item in items:
        product = db.scalar(
            select(Product).where(Product.id == raw_item.product_id, Product.store_id == store_id, Product.active == True)
        )
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {raw_item.product_id} not found")

        variant_price = 0.0
        if raw_item.variant_id:
            variant = db.scalar(
                select(ProductVariant).where(
                    ProductVariant.id == raw_item.variant_id,
                    ProductVariant.product_id == product.id,
                    ProductVariant.active == True,
                )
            )
            if not variant:
                raise HTTPException(status_code=404, detail=f"Variant {raw_item.variant_id} not found")
            variant_price = float(variant.extra_price)

        extra_option_ids = sorted({int(extra_id) for extra_id in (raw_item.extra_option_ids or [])})
        extras_total = 0.0
        extra_names: list[str] = []
        if extra_option_ids:
            extras = db.scalars(
                select(ProductExtraOption).where(
                    ProductExtraOption.product_id == product.id,
                    ProductExtraOption.id.in_(extra_option_ids),
                    ProductExtraOption.active == True,
                )
            ).all()
            if len(extras) != len(extra_option_ids):
                raise HTTPException(status_code=422, detail="One or more extras are invalid for this product")
            extras_total = sum(float(extra.extra_price) for extra in extras)
            extra_names = [extra.name for extra in sorted(extras, key=lambda row: row.id)]

        notes_parts: list[str] = []
        if raw_item.notes and raw_item.notes.strip():
            notes_parts.append(raw_item.notes.strip())
        if extra_names:
            notes_parts.append(f"Extras: {', '.join(extra_names)}")
        merged_notes = " | ".join(notes_parts) if notes_parts else None

        sector = route_item_to_sector(product)
        sectors_present.add(sector)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                variant_id=raw_item.variant_id,
                created_by_client_id=client_id,
                qty=raw_item.qty,
                unit_price=float(product.base_price) + variant_price + extras_total,
                notes=merged_notes,
                sector=sector,
                status=OrderStatus.RECEIVED.value,
            )
        )

    db.flush()
    return sectors_present
