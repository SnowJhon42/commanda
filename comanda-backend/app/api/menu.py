from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MenuCategory, Product, ProductExtraOption, ProductVariant, Store
from app.db.session import get_db
from app.schemas.menu import CategoryOut, ExtraOptionOut, MenuResponse, ProductOut, VariantOut

router = APIRouter(tags=["menu"])


@router.get("/menu", response_model=MenuResponse)
def get_menu(store_id: int, db: Session = Depends(get_db)) -> MenuResponse:
    store = db.scalar(select(Store).where(Store.id == store_id))
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    categories = db.scalars(
        select(MenuCategory).where(MenuCategory.store_id == store_id, MenuCategory.active == True).order_by(
            MenuCategory.sort_order.asc(), MenuCategory.id.asc()
        )
    ).all()
    products = db.scalars(
        select(Product).where(Product.store_id == store_id, Product.active == True, Product.archived == False)
    ).all()
    product_ids = [p.id for p in products]
    variants = (
        db.scalars(
            select(ProductVariant).where(ProductVariant.product_id.in_(product_ids), ProductVariant.active == True)
        ).all()
        if product_ids
        else []
    )
    extra_options = (
        db.scalars(
            select(ProductExtraOption).where(
                ProductExtraOption.product_id.in_(product_ids),
                ProductExtraOption.active == True,
            )
        ).all()
        if product_ids
        else []
    )

    variants_by_product: dict[int, list[VariantOut]] = {}
    for variant in variants:
        variants_by_product.setdefault(variant.product_id, []).append(
            VariantOut(id=variant.id, name=variant.name, extra_price=float(variant.extra_price))
        )
    extras_by_product: dict[int, list[ExtraOptionOut]] = {}
    for extra in extra_options:
        extras_by_product.setdefault(extra.product_id, []).append(
            ExtraOptionOut(id=extra.id, name=extra.name, extra_price=float(extra.extra_price), active=bool(extra.active))
        )

    return MenuResponse(
        store_id=store_id,
        store_name=store.name,
        show_live_total_to_client=bool(store.show_live_total_to_client),
        whatsapp_share_template=store.whatsapp_share_template,
        logo_url=store.logo_url,
        cover_image_url=store.cover_image_url,
        theme_preset=store.theme_preset or "CLASSIC",
        accent_color=store.accent_color or "ROJO",
        show_watermark_logo=bool(store.show_watermark_logo),
        categories=[CategoryOut(id=c.id, name=c.name, image_url=c.image_url, sort_order=c.sort_order) for c in categories],
        products=[
            ProductOut(
                id=p.id,
                category_id=p.category_id,
                name=p.name,
                image_url=p.image_url,
                description=p.description,
                base_price=float(p.base_price),
                fulfillment_sector=p.fulfillment_sector,
                variants=variants_by_product.get(p.id, []),
                extra_options=extras_by_product.get(p.id, []),
                active=p.active,
            )
            for p in products
        ],
    )
