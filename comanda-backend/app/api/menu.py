from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MenuCategory, Product, ProductExtraOption, ProductVariant, Store
from app.db.session import get_db
from app.schemas.menu import CategoryOut, ExtraOptionOut, MenuResponse, ProductOut, VariantOut

router = APIRouter(tags=["menu"])


def _product_prices(base_price: float, vat_rate: float) -> tuple[float, float]:
    gross_price = Decimal(str(base_price or 0))
    rate = Decimal(str(vat_rate or 0))
    divisor = Decimal("1") + (rate / Decimal("100"))
    net_price = gross_price if divisor == Decimal("0") else (gross_price / divisor)
    net_price = net_price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    vat_amount = (gross_price - net_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(net_price), float(vat_amount)


def _product_out(product: Product, variants_by_product: dict[int, list[VariantOut]], extras_by_product: dict[int, list[ExtraOptionOut]]) -> ProductOut:
    vat_rate = float(product.vat_rate or 21)
    net_price, vat_amount = _product_prices(float(product.base_price), vat_rate)
    return ProductOut(
        id=product.id,
        category_id=product.category_id,
        name=product.name,
        image_url=product.image_url,
        description=product.description,
        base_price=float(product.base_price),
        vat_rate=vat_rate,
        net_price=net_price,
        vat_amount=vat_amount,
        fulfillment_sector=product.fulfillment_sector,
        variants=variants_by_product.get(product.id, []),
        extra_options=extras_by_product.get(product.id, []),
        active=product.active,
    )


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
        tenant_id=store.tenant_id,
        store_id=store_id,
        store_name=store.name,
        show_live_total_to_client=bool(store.show_live_total_to_client),
        whatsapp_share_template=store.whatsapp_share_template,
        logo_url=store.logo_url,
        cover_image_url=store.cover_image_url,
        theme_preset=store.theme_preset or "CLASSIC",
        accent_color=store.accent_color or "ROJO",
        background_color=store.background_color or "ROJO",
        background_image_url=store.background_image_url,
        show_watermark_logo=bool(store.show_watermark_logo),
        payment_cash_enabled=bool(store.payment_cash_enabled),
        payment_transfer_enabled=bool(store.payment_transfer_enabled),
        payment_card_enabled=bool(store.payment_card_enabled),
        payment_mercado_pago_enabled=bool(store.payment_mercado_pago_enabled),
        payment_modo_enabled=bool(store.payment_modo_enabled),
        payment_transfer_instructions=store.payment_transfer_instructions,
        categories=[CategoryOut(id=c.id, name=c.name, image_url=c.image_url, sort_order=c.sort_order) for c in categories],
        products=[_product_out(p, variants_by_product, extras_by_product) for p in products],
    )
