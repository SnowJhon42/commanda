from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MenuCategory, Product, ProductVariant, Store
from app.db.session import get_db
from app.schemas.menu import CategoryOut, MenuResponse, ProductOut, VariantOut

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
    products = db.scalars(select(Product).where(Product.store_id == store_id, Product.active == True)).all()
    variants = db.scalars(select(ProductVariant).where(ProductVariant.active == True)).all()

    variants_by_product: dict[int, list[VariantOut]] = {}
    for variant in variants:
        variants_by_product.setdefault(variant.product_id, []).append(
            VariantOut(id=variant.id, name=variant.name, extra_price=float(variant.extra_price))
        )

    return MenuResponse(
        store_id=store_id,
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
                active=p.active,
            )
            for p in products
        ],
    )
