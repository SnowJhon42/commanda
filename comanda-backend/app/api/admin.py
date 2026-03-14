from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_staff
from app.db.models import (
    FulfillmentSector,
    ItemStatusEvent,
    MenuCategory,
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductExtraOption,
    Sector,
    StaffAccount,
    Table,
    TableSessionCashRequest,
)
from app.db.session import get_db
from app.schemas.menu import (
    CategoryOut,
    ExtraOptionCreateIn,
    ExtraOptionOut,
    ExtraOptionUpdateIn,
    ImageUploadOut,
    ImageUrlPatchIn,
    ImageUrlPatchOut,
    ProductCreateIn,
    ProductOut,
    ProductUpdateIn,
    VariantOut,
)
from app.schemas.orders import (
    AdminOrderItemsDetailResponse,
    AdminOrderSummaryOut,
    AdminOrdersResponse,
    AdminSectorDelayOut,
    ItemStatusEventOut,
    SectorStatusOut,
    StaffBoardItemOut,
)
from app.services.billing import get_latest_bill_split, to_bill_split_out
from app.services.cloudflare_r2 import upload_menu_image_to_r2

router = APIRouter(prefix="/admin", tags=["admin"])


def _ensure_admin(current_staff: StaffAccount) -> None:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")


def _product_out(product: Product) -> ProductOut:
    return ProductOut(
        id=product.id,
        category_id=product.category_id,
        name=product.name,
        image_url=product.image_url,
        description=product.description,
        base_price=float(product.base_price),
        fulfillment_sector=product.fulfillment_sector,
        variants=[
            VariantOut(id=variant.id, name=variant.name, extra_price=float(variant.extra_price))
            for variant in sorted(product.variants, key=lambda variant: variant.id)
        ],
        extra_options=[
            ExtraOptionOut(
                id=extra.id,
                name=extra.name,
                extra_price=float(extra.extra_price),
                active=bool(extra.active),
            )
            for extra in sorted(product.extra_options, key=lambda extra: extra.id)
        ],
        active=product.active,
    )


@router.get("/menu/categories", response_model=list[CategoryOut])
def list_admin_menu_categories(
    db: Session = Depends(get_db), current_staff: StaffAccount = Depends(get_current_staff)
) -> list[CategoryOut]:
    _ensure_admin(current_staff)
    categories = (
        db.scalars(
            select(MenuCategory)
            .where(MenuCategory.store_id == current_staff.store_id)
            .order_by(MenuCategory.sort_order.asc(), MenuCategory.id.asc())
        ).all()
    )
    return [
        CategoryOut(id=category.id, name=category.name, image_url=category.image_url, sort_order=category.sort_order)
        for category in categories
    ]


@router.get("/menu/products", response_model=list[ProductOut])
def list_admin_menu_products(
    db: Session = Depends(get_db), current_staff: StaffAccount = Depends(get_current_staff)
) -> list[ProductOut]:
    _ensure_admin(current_staff)
    products = (
        db.execute(
            select(Product)
            .where(Product.store_id == current_staff.store_id)
            .options(joinedload(Product.variants), joinedload(Product.extra_options))
            .order_by(Product.id.asc())
        )
        .unique()
        .scalars()
        .all()
    )
    return [_product_out(product) for product in products]


@router.post("/menu/products", response_model=ProductOut, status_code=201)
def create_admin_product(
    payload: ProductCreateIn,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ProductOut:
    _ensure_admin(current_staff)
    sector_value = payload.fulfillment_sector.upper()
    if sector_value not in {value.value for value in FulfillmentSector}:
        raise HTTPException(status_code=422, detail="Sector inválido")

    if payload.category_id is not None:
        category = db.scalar(
            select(MenuCategory).where(
                MenuCategory.store_id == current_staff.store_id, MenuCategory.id == payload.category_id
            )
        )
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    image_payload = ImageUrlPatchIn(image_url=payload.image_url)
    product = Product(
        store_id=current_staff.store_id,
        name=payload.name.strip(),
        description=payload.description,
        base_price=payload.base_price,
        fulfillment_sector=sector_value,
        category_id=payload.category_id,
        image_url=image_payload.image_url,
        active=payload.active,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    db.refresh(product, attribute_names=["variants", "extra_options"])
    return _product_out(product)


@router.patch("/menu/products/{product_id}", response_model=ProductOut)
def update_admin_product(
    product_id: int,
    payload: ProductUpdateIn,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ProductOut:
    _ensure_admin(current_staff)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.store_id == current_staff.store_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.name is not None:
        product.name = payload.name.strip()
    if payload.description is not None:
        product.description = payload.description
    if payload.base_price is not None:
        product.base_price = payload.base_price
    if payload.fulfillment_sector:
        sector_value = payload.fulfillment_sector.upper()
        if sector_value not in {value.value for value in FulfillmentSector}:
            raise HTTPException(status_code=422, detail="Sector inválido")
        product.fulfillment_sector = sector_value
    if payload.category_id is not None:
        if payload.category_id:
            category = db.scalar(
                select(MenuCategory).where(
                    MenuCategory.store_id == current_staff.store_id, MenuCategory.id == payload.category_id
                )
            )
            if not category:
                raise HTTPException(status_code=404, detail="Category not found")
        product.category_id = payload.category_id
    if payload.active is not None:
        product.active = payload.active
    if payload.image_url is not None:
        product.image_url = ImageUrlPatchIn(image_url=payload.image_url).image_url

    db.add(product)
    db.commit()
    db.refresh(product)
    db.refresh(product, attribute_names=["variants", "extra_options"])
    return _product_out(product)


@router.post("/menu/products/{product_id}/extra-options", response_model=ExtraOptionOut, status_code=201)
def create_product_extra_option(
    product_id: int,
    payload: ExtraOptionCreateIn,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ExtraOptionOut:
    _ensure_admin(current_staff)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.store_id == current_staff.store_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    extra = ProductExtraOption(
        product_id=product.id,
        name=payload.name.strip(),
        extra_price=payload.extra_price,
        active=payload.active,
    )
    db.add(extra)
    db.commit()
    db.refresh(extra)
    return ExtraOptionOut(id=extra.id, name=extra.name, extra_price=float(extra.extra_price), active=bool(extra.active))


@router.patch("/menu/extra-options/{extra_option_id}", response_model=ExtraOptionOut)
def update_product_extra_option(
    extra_option_id: int,
    payload: ExtraOptionUpdateIn,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ExtraOptionOut:
    _ensure_admin(current_staff)
    extra = db.scalar(
        select(ProductExtraOption)
        .join(Product, Product.id == ProductExtraOption.product_id)
        .where(ProductExtraOption.id == extra_option_id, Product.store_id == current_staff.store_id)
    )
    if not extra:
        raise HTTPException(status_code=404, detail="Extra option not found")

    if payload.name is not None:
        extra.name = payload.name.strip()
    if payload.extra_price is not None:
        extra.extra_price = payload.extra_price
    if payload.active is not None:
        extra.active = payload.active

    db.add(extra)
    db.commit()
    db.refresh(extra)
    return ExtraOptionOut(id=extra.id, name=extra.name, extra_price=float(extra.extra_price), active=bool(extra.active))


@router.post("/menu/images", response_model=ImageUploadOut)
def upload_menu_image(
    file: UploadFile = File(...),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ImageUploadOut:
    _ensure_admin(current_staff)
    image_url = upload_menu_image_to_r2(file)
    return ImageUploadOut(image_url=image_url)


@router.patch("/menu/categories/{category_id}/image", response_model=ImageUrlPatchOut)
def patch_category_image_url(
    category_id: int,
    payload: ImageUrlPatchIn,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ImageUrlPatchOut:
    _ensure_admin(current_staff)
    category = db.scalar(
        select(MenuCategory).where(MenuCategory.id == category_id, MenuCategory.store_id == current_staff.store_id)
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    category.image_url = payload.image_url
    db.add(category)
    db.commit()
    db.refresh(category)
    return ImageUrlPatchOut(id=category.id, image_url=category.image_url)


@router.patch("/menu/products/{product_id}/image", response_model=ImageUrlPatchOut)
def patch_product_image_url(
    product_id: int,
    payload: ImageUrlPatchIn,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ImageUrlPatchOut:
    _ensure_admin(current_staff)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.store_id == current_staff.store_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.image_url = payload.image_url
    db.add(product)
    db.commit()
    db.refresh(product)
    return ImageUrlPatchOut(id=product.id, image_url=product.image_url)


@router.get("/orders", response_model=AdminOrdersResponse)
def list_admin_orders(
    store_id: int,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> AdminOrdersResponse:
    _ensure_admin(current_staff)
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    query = (
        select(Order, Table)
        .join(Table, Table.id == Order.table_id)
        .where(Order.store_id == store_id)
        .options(joinedload(Order.items))
    )
    if status:
        query = query.where(Order.status_aggregated == status)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orders_with_table = db.execute(query.order_by(Order.created_at.desc()).limit(limit).offset(offset)).unique().all()
    now_utc = datetime.now(tz=timezone.utc)

    return AdminOrdersResponse(
        total=total,
        items=[
            AdminOrderSummaryOut(
                order_id=order.id,
                table_code=table.code,
                guest_count=order.guest_count,
                total_items=sum(item.qty for item in order.items),
                delivered_items=sum(item.qty for item in order.items if item.status == OrderStatus.DELIVERED.value),
                total_amount=float(sum(float(item.unit_price) * item.qty for item in order.items)),
                status_aggregated=order.status_aggregated,
                sectors=[
                    SectorStatusOut(sector=item.sector, status=item.status)
                    for item in sorted(order.items, key=lambda row: (row.sector, row.id))
                ],
                elapsed_minutes=max(
                    0,
                    int(
                        (
                            (
                                now_utc
                                if order.status_aggregated != OrderStatus.DELIVERED.value
                                else (
                                    order.updated_at.replace(tzinfo=timezone.utc)
                                    if order.updated_at.tzinfo is None
                                    else order.updated_at
                                )
                            )
                            - (
                                order.created_at.replace(tzinfo=timezone.utc)
                                if order.created_at.tzinfo is None
                                else order.created_at
                            )
                        ).total_seconds()
                        // 60
                    ),
                ),
                created_at=order.created_at,
                updated_at=order.updated_at,
            )
            for order, table in orders_with_table
        ],
    )


@router.get("/orders/{order_id}/items", response_model=AdminOrderItemsDetailResponse)
def get_admin_order_items_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> AdminOrderItemsDetailResponse:
    _ensure_admin(current_staff)
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.store_id == current_staff.store_id)
        .options(joinedload(Order.items).joinedload(OrderItem.product), joinedload(Order.table))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    now_utc = datetime.now(tz=timezone.utc)
    delays: list[AdminSectorDelayOut] = []
    sectors = sorted({item.sector for item in order.items})
    for sector in sectors:
        waiting = [
            item
            for item in order.items
            if item.sector == sector and item.status in {OrderStatus.RECEIVED.value, OrderStatus.IN_PROGRESS.value}
        ]
        if not waiting:
            delays.append(AdminSectorDelayOut(sector=sector, waiting_items=0, oldest_waiting_minutes=0))
            continue
        oldest = min(item.created_at for item in waiting)
        oldest_aware = oldest.replace(tzinfo=timezone.utc) if oldest.tzinfo is None else oldest
        delta = now_utc - oldest_aware
        delays.append(
            AdminSectorDelayOut(
                sector=sector,
                waiting_items=len(waiting),
                oldest_waiting_minutes=max(0, int(delta.total_seconds() // 60)),
            )
        )

    return AdminOrderItemsDetailResponse(
        order_id=order.id,
        table_session_id=order.table_session_id,
        table_code=order.table.code,
        guest_count=order.guest_count,
        ticket_number=order.ticket_number,
        status_aggregated=order.status_aggregated,
        total_amount=float(sum(float(item.unit_price) * item.qty for item in order.items)),
        delivered_items=sum(item.qty for item in order.items if item.status == OrderStatus.DELIVERED.value),
        total_items=sum(item.qty for item in order.items),
        delays=delays,
        items=[
            StaffBoardItemOut(
                item_id=item.id,
                order_id=order.id,
                table_code=order.table.code,
                guest_count=order.guest_count,
                item_name=item.product.name,
                qty=item.qty,
                unit_price=float(item.unit_price),
                notes=item.notes,
                sector=item.sector,
                status=item.status,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in sorted(order.items, key=lambda row: (row.sector, row.created_at, row.id))
        ],
        events=[
            ItemStatusEventOut(
                id=event.id,
                item_id=event.item_id,
                sector=event.sector,
                from_status=event.from_status,
                to_status=event.to_status,
                changed_by_staff_id=event.changed_by_staff_id,
                created_at=event.created_at,
            )
            for event in db.scalars(
                select(ItemStatusEvent)
                .where(ItemStatusEvent.order_id == order.id)
                .order_by(ItemStatusEvent.created_at.desc(), ItemStatusEvent.id.desc())
            ).all()
        ],
        bill_split=to_bill_split_out(db, get_latest_bill_split(db, order.id)),
        cash_requests=[
            {
                "id": req.id,
                "table_session_id": req.table_session_id,
                "order_id": req.order_id,
                "client_id": req.client_id,
                "payer_label": req.payer_label,
                "request_kind": req.request_kind,
                "note": req.note,
                "status": req.status,
                "created_at": req.created_at,
                "resolved_at": req.resolved_at,
                "resolved_by_staff_id": req.resolved_by_staff_id,
            }
            for req in db.scalars(
                select(TableSessionCashRequest)
                .where(TableSessionCashRequest.order_id == order.id)
                .order_by(TableSessionCashRequest.created_at.desc(), TableSessionCashRequest.id.desc())
            ).all()
        ],
        created_at=order.created_at,
    )
