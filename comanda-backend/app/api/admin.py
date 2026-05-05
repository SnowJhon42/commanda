from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_staff
from app.core.security import verify_pin
from app.db.models import (
    BillPartPaymentStatus,
    BillSplit,
    BillSplitPart,
    BillSplitStatus,
    FulfillmentSector,
    ItemStatusEvent,
    MenuCategory,
    Order,
    OrderItem,
    OrderPaymentStatus,
    OrderReviewStatus,
    OrderStatus,
    PaymentGate,
    Product,
    ProductExtraOption,
    ProductVariant,
    Sector,
    ServiceMode,
    StaffAccount,
    Store,
    Table,
    TableSession,
    TableSessionCashRequest,
    TableSessionStatus,
)
from app.db.session import get_db
from app.schemas.menu import (
    CategoryCreateIn,
    CategoryOut,
    ExtraOptionCreateIn,
    ExtraOptionOut,
    ExtraOptionUpdateIn,
    ImageUploadOut,
    ImageUrlPatchIn,
    ImageUrlPatchOut,
    MenuImportCommitIn,
    MenuImportCommitOut,
    MenuImportDraftItem,
    MenuImportPreviewOut,
    ProductCreateIn,
    ProductDeleteOut,
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
from app.services.menu_import import build_menu_import_preview
from app.services.print_tracking import build_order_print_status

router = APIRouter(prefix="/admin", tags=["admin"])


def _ensure_admin(current_staff: StaffAccount) -> None:
    if current_staff.sector != Sector.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")


def _ensure_owner_access(current_staff: StaffAccount, db: Session, owner_password: str | None) -> None:
    _ensure_admin(current_staff)
    store = db.get(Store, current_staff.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    owner_hash = (store.owner_password_hash or "").strip()
    if not owner_hash or not verify_pin((owner_password or "").strip(), owner_hash):
        raise HTTPException(status_code=403, detail="Contraseña de dueño incorrecta.")


def _order_total_amount(order: Order) -> float:
    return float(sum(float(item.unit_price) * item.qty for item in order.items))


def _order_has_pending_payment(db: Session, order: Order) -> bool:
    if order.review_status != OrderReviewStatus.APPROVED.value:
        return False
    if order.payment_gate == PaymentGate.BEFORE_PREPARATION.value:
        return order.payment_status != OrderPaymentStatus.CONFIRMED.value

    total_amount = _order_total_amount(order)
    if total_amount <= 0:
        return False

    cash_pending = (
        db.scalar(
            select(func.count())
            .select_from(TableSessionCashRequest)
            .where(
                TableSessionCashRequest.order_id == order.id,
                TableSessionCashRequest.request_kind == "CASH_PAYMENT",
                TableSessionCashRequest.status == "PENDING",
            )
        )
        or 0
    )
    if cash_pending > 0:
        return True

    bill_split = to_bill_split_out(db, get_latest_bill_split(db, order.id))
    if not bill_split:
        return False

    if bill_split.status != BillSplitStatus.CLOSED.value:
        return True

    return any(part.payment_status != BillPartPaymentStatus.CONFIRMED.value for part in bill_split.parts)


def _order_payment_confirmed(db: Session, order: Order) -> bool:
    if order.review_status != OrderReviewStatus.APPROVED.value:
        return False
    if order.payment_gate == PaymentGate.BEFORE_PREPARATION.value:
        return order.payment_status == OrderPaymentStatus.CONFIRMED.value

    total_amount = _order_total_amount(order)
    if total_amount <= 0:
        return True

    bill_split = to_bill_split_out(db, get_latest_bill_split(db, order.id))
    if not bill_split:
        return False

    if bill_split.status != BillSplitStatus.CLOSED.value:
        return False

    return all(part.payment_status == BillPartPaymentStatus.CONFIRMED.value for part in bill_split.parts)


def _reported_payment_method_for_order(db: Session, order: Order) -> str | None:
    if order.review_status != OrderReviewStatus.APPROVED.value:
        return None
    bill_split = to_bill_split_out(db, get_latest_bill_split(db, order.id))
    if not bill_split:
        return None

    reported_parts = [part for part in bill_split.parts if part.payment_status == BillPartPaymentStatus.REPORTED.value]
    if not reported_parts:
        return None

    reported_parts.sort(key=lambda part: part.reported_at or datetime.min, reverse=True)
    return reported_parts[0].payment_method or None


def _minutes_since(reference_dt: datetime | None, now_utc: datetime) -> int:
    if not reference_dt:
        return 0
    reference_aware = reference_dt.replace(tzinfo=timezone.utc) if reference_dt.tzinfo is None else reference_dt
    current_aware = now_utc.replace(tzinfo=timezone.utc) if now_utc.tzinfo is None else now_utc
    return max(0, int((current_aware - reference_aware).total_seconds() // 60))


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
        archived=bool(product.archived),
    )


@router.get("/menu/categories", response_model=list[CategoryOut])
def list_admin_menu_categories(
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> list[CategoryOut]:
    _ensure_owner_access(current_staff, db, owner_password)
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


@router.post("/menu/categories", response_model=CategoryOut, status_code=201)
def create_admin_menu_category(
    payload: CategoryCreateIn,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> CategoryOut:
    _ensure_owner_access(current_staff, db, owner_password)
    name = payload.name.strip()
    existing = db.scalar(
        select(MenuCategory).where(MenuCategory.store_id == current_staff.store_id, MenuCategory.name == name)
    )
    if existing:
        return CategoryOut(
            id=existing.id,
            name=existing.name,
            image_url=existing.image_url,
            sort_order=existing.sort_order,
        )

    sort_order = payload.sort_order
    if sort_order is None:
        max_sort = (
            db.scalar(select(func.max(MenuCategory.sort_order)).where(MenuCategory.store_id == current_staff.store_id))
            or 0
        )
        sort_order = int(max_sort) + 10

    category = MenuCategory(store_id=current_staff.store_id, name=name, sort_order=sort_order)
    db.add(category)
    db.commit()
    db.refresh(category)
    return CategoryOut(id=category.id, name=category.name, image_url=category.image_url, sort_order=category.sort_order)


def _get_or_create_menu_category(
    db: Session,
    store_id: int,
    name: str | None,
    category_cache: dict[str, MenuCategory],
) -> tuple[MenuCategory | None, bool]:
    clean_name = (name or "").strip()
    if not clean_name:
        return None, False
    key = clean_name.lower()
    if key in category_cache:
        return category_cache[key], False

    category = db.scalar(select(MenuCategory).where(MenuCategory.store_id == store_id, MenuCategory.name == clean_name))
    if category:
        category_cache[key] = category
        return category, False

    max_sort = db.scalar(select(func.max(MenuCategory.sort_order)).where(MenuCategory.store_id == store_id)) or 0
    category = MenuCategory(store_id=store_id, name=clean_name, sort_order=int(max_sort) + 10)
    db.add(category)
    db.flush()
    category_cache[key] = category
    return category, True


def _validated_import_item(item: MenuImportDraftItem) -> bool:
    if item.errors:
        return False
    if not item.name.strip():
        return False
    if item.base_price is None or item.base_price < 0:
        return False
    return True


@router.post("/menu/import/preview", response_model=MenuImportPreviewOut)
async def preview_menu_import(
    file: UploadFile = File(...),
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> MenuImportPreviewOut:
    _ensure_owner_access(current_staff, db, owner_password)
    filename = file.filename or "carta"
    content = await file.read()
    source_kind, result = build_menu_import_preview(filename=filename, content=content)
    items = [MenuImportDraftItem(**item) for item in result.get("items", [])]
    existing_product_names = {
        product_name.lower()
        for product_name in db.scalars(select(Product.name).where(Product.store_id == current_staff.store_id)).all()
    }
    for item in items:
        if item.name.strip().lower() in existing_product_names and "Producto existente" not in item.warnings:
            item.warnings.append("Producto existente")
    return MenuImportPreviewOut(
        source_filename=filename,
        source_kind=source_kind,
        items=items,
        warnings=result.get("warnings", []),
    )


@router.post("/menu/import/commit", response_model=MenuImportCommitOut)
def commit_menu_import(
    payload: MenuImportCommitIn,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> MenuImportCommitOut:
    _ensure_owner_access(current_staff, db, owner_password)
    category_cache = {
        category.name.lower(): category
        for category in db.scalars(select(MenuCategory).where(MenuCategory.store_id == current_staff.store_id)).all()
    }
    existing_product_names = {
        product_name.lower()
        for product_name in db.scalars(select(Product.name).where(Product.store_id == current_staff.store_id)).all()
    }

    created_categories = 0
    created_products = 0
    skipped_items = 0

    for item in payload.items:
        if not _validated_import_item(item):
            skipped_items += 1
            continue
        product_name = item.name.strip()
        if product_name.lower() in existing_product_names:
            skipped_items += 1
            continue

        category, created_category = _get_or_create_menu_category(
            db, current_staff.store_id, item.category_name, category_cache
        )
        if created_category:
            created_categories += 1

        product = Product(
            store_id=current_staff.store_id,
            name=product_name,
            description=item.description.strip() if item.description else None,
            base_price=item.base_price,
            fulfillment_sector=item.fulfillment_sector,
            category_id=category.id if category else None,
            image_url=ImageUrlPatchIn(image_url=item.image_url).image_url if item.image_url else None,
            active=item.active,
            archived=False,
        )
        db.add(product)
        existing_product_names.add(product_name.lower())
        created_products += 1

    db.commit()
    return MenuImportCommitOut(
        created_categories=created_categories,
        created_products=created_products,
        skipped_items=skipped_items,
    )


@router.get("/menu/products", response_model=list[ProductOut])
def list_admin_menu_products(
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> list[ProductOut]:
    _ensure_owner_access(current_staff, db, owner_password)
    products = (
        db.execute(
            select(Product)
            .where(Product.store_id == current_staff.store_id, Product.archived == False)
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
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ProductOut:
    _ensure_owner_access(current_staff, db, owner_password)
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
        archived=False,
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
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ProductOut:
    _ensure_owner_access(current_staff, db, owner_password)
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
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ExtraOptionOut:
    _ensure_owner_access(current_staff, db, owner_password)
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
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ExtraOptionOut:
    _ensure_owner_access(current_staff, db, owner_password)
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
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ImageUploadOut:
    _ensure_owner_access(current_staff, db, owner_password)
    image_url = upload_menu_image_to_r2(file)
    return ImageUploadOut(image_url=image_url)


@router.patch("/menu/categories/{category_id}/image", response_model=ImageUrlPatchOut)
def patch_category_image_url(
    category_id: int,
    payload: ImageUrlPatchIn,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ImageUrlPatchOut:
    _ensure_owner_access(current_staff, db, owner_password)
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
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ImageUrlPatchOut:
    _ensure_owner_access(current_staff, db, owner_password)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.store_id == current_staff.store_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.image_url = payload.image_url
    db.add(product)
    db.commit()
    db.refresh(product)
    return ImageUrlPatchOut(id=product.id, image_url=product.image_url)


@router.delete("/menu/products/{product_id}", response_model=ProductDeleteOut)
def delete_admin_product(
    product_id: int,
    owner_password: str | None = Header(default=None, alias="X-Owner-Password"),
    db: Session = Depends(get_db),
    current_staff: StaffAccount = Depends(get_current_staff),
) -> ProductDeleteOut:
    _ensure_owner_access(current_staff, db, owner_password)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.store_id == current_staff.store_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    usage_count = (
        db.scalar(select(func.count()).select_from(OrderItem).where(OrderItem.product_id == product.id))
        or 0
    )
    had_history = usage_count > 0

    if not had_history:
        extras = db.scalars(select(ProductExtraOption).where(ProductExtraOption.product_id == product.id)).all()
        for extra in extras:
            db.delete(extra)
        variants = db.scalars(select(ProductVariant).where(ProductVariant.product_id == product.id)).all()
        for variant in variants:
            db.delete(variant)
        db.delete(product)
        db.commit()
        return ProductDeleteOut(
            product_id=product_id,
            deleted=True,
            archived=False,
            had_history=False,
        )

    product.active = False
    product.archived = True
    db.add(product)
    db.commit()
    return ProductDeleteOut(
        product_id=product.id,
        deleted=False,
        archived=True,
        had_history=True,
    )


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
        .where(
            Order.store_id == store_id,
            Order.review_status != OrderReviewStatus.REJECTED.value,
        )
        .options(joinedload(Order.items))
    )
    if status:
        query = query.where(Order.status_aggregated == status)

    active_session_ids = set(
        db.scalars(
            select(TableSession.id).where(
                TableSession.store_id == store_id,
                TableSession.status.in_(
                    [
                        TableSessionStatus.OPEN.value,
                        TableSessionStatus.MESA_OCUPADA.value,
                        TableSessionStatus.CON_PEDIDO.value,
                    ]
                ),
            )
        ).all()
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orders_with_table = db.execute(query.order_by(Order.created_at.desc()).limit(limit).offset(offset)).unique().all()
    now_utc = datetime.now(tz=timezone.utc)
    order_ids = [int(order.id) for order, _table in orders_with_table]

    latest_split_rows = db.execute(
        select(BillSplit.order_id, func.max(BillSplit.id).label("bill_split_id"))
        .where(BillSplit.order_id.in_(order_ids))
        .group_by(BillSplit.order_id)
    ).all() if order_ids else []
    latest_split_id_by_order = {int(order_id): int(bill_split_id) for order_id, bill_split_id in latest_split_rows if bill_split_id is not None}
    latest_split_ids = list(latest_split_id_by_order.values())

    split_by_id = {
        int(split.id): split
        for split in (
            db.scalars(select(BillSplit).where(BillSplit.id.in_(latest_split_ids))).all() if latest_split_ids else []
        )
    }
    parts_by_split_id: dict[int, list[BillSplitPart]] = {}
    if latest_split_ids:
        parts = db.scalars(
            select(BillSplitPart)
            .where(BillSplitPart.bill_split_id.in_(latest_split_ids))
            .order_by(BillSplitPart.bill_split_id.asc(), BillSplitPart.id.asc())
        ).all()
        for part in parts:
            parts_by_split_id.setdefault(int(part.bill_split_id), []).append(part)

    cash_pending_rows = db.execute(
        select(
            TableSessionCashRequest.order_id,
            func.count().label("pending_count"),
        )
        .where(
            TableSessionCashRequest.order_id.in_(order_ids),
            TableSessionCashRequest.request_kind == "CASH_PAYMENT",
            TableSessionCashRequest.status == "PENDING",
        )
        .group_by(TableSessionCashRequest.order_id)
    ).all() if order_ids else []
    cash_pending_by_order = {int(order_id): int(pending_count or 0) for order_id, pending_count in cash_pending_rows}

    items: list[AdminOrderSummaryOut] = []
    for order, table in orders_with_table:
        total_amount = _order_total_amount(order)
        latest_split = split_by_id.get(latest_split_id_by_order.get(int(order.id), -1))
        split_parts = parts_by_split_id.get(int(latest_split.id), []) if latest_split else []
        cash_pending = cash_pending_by_order.get(int(order.id), 0)

        if order.review_status != OrderReviewStatus.APPROVED.value:
            has_pending_payment = False
            payment_confirmed = False
            reported_payment_method = None
        elif order.payment_gate == PaymentGate.BEFORE_PREPARATION.value:
            payment_confirmed = order.payment_status == OrderPaymentStatus.CONFIRMED.value
            has_pending_payment = not payment_confirmed
            reported_payment_method = None
        elif total_amount <= 0:
            payment_confirmed = True
            has_pending_payment = False
            reported_payment_method = None
        else:
            split_closed = bool(latest_split and latest_split.status == BillSplitStatus.CLOSED.value)
            all_confirmed = bool(split_parts) and all(part.payment_status == BillPartPaymentStatus.CONFIRMED.value for part in split_parts)
            payment_confirmed = split_closed and all_confirmed
            if cash_pending > 0:
                has_pending_payment = True
            elif not latest_split:
                has_pending_payment = False
            elif latest_split.status != BillSplitStatus.CLOSED.value:
                has_pending_payment = True
            else:
                has_pending_payment = any(part.payment_status != BillPartPaymentStatus.CONFIRMED.value for part in split_parts)

            reported_parts = [part for part in split_parts if part.payment_status == BillPartPaymentStatus.REPORTED.value]
            if reported_parts:
                reported_parts.sort(key=lambda part: part.reported_at or datetime.min, reverse=True)
                reported_payment_method = reported_parts[0].payment_method or None
            else:
                reported_payment_method = None

        items.append(
            AdminOrderSummaryOut(
                order_id=order.id,
                table_code=table.code,
                guest_count=order.guest_count,
                total_items=sum(item.qty for item in order.items),
                delivered_items=sum(item.qty for item in order.items if item.status == OrderStatus.DELIVERED.value),
                total_amount=total_amount,
                status_aggregated=order.status_aggregated,
                review_status=order.review_status,
                has_pending_payment=has_pending_payment,
                is_active_session=bool(order.table_session_id and order.table_session_id in active_session_ids),
                sectors=[
                    SectorStatusOut(sector=item.sector, status=item.status)
                    for item in sorted(order.items, key=lambda row: (row.sector, row.id))
                ],
                elapsed_minutes=_minutes_since(
                    order.created_at,
                    now_utc if order.status_aggregated != OrderStatus.DELIVERED.value else order.updated_at,
                ),
                created_at=order.created_at,
                updated_at=order.updated_at,
                bill_split_closed=bool(latest_split and latest_split.status == BillSplitStatus.CLOSED.value),
                payment_confirmed=payment_confirmed,
                service_mode=order.service_mode,
                payment_gate=order.payment_gate,
                payment_status=order.payment_status,
                reported_payment_method=reported_payment_method,
                print_status=build_order_print_status(order),
            )
        )

    return AdminOrdersResponse(total=total, items=items)


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
    table_session = None
    if order.table_session_id:
        table_session = db.scalar(select(TableSession).where(TableSession.id == order.table_session_id))
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
        review_status=order.review_status,
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
                review_status=order.review_status,
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
        print_status=build_order_print_status(order),
        table_elapsed_minutes=_minutes_since(table_session.created_at if table_session else order.created_at, now_utc),
        order_elapsed_minutes=_minutes_since(order.created_at, now_utc),
        created_at=order.created_at,
    )
