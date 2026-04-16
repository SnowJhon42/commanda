from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Sector(str, Enum):
    ADMIN = "ADMIN"
    KITCHEN = "KITCHEN"
    BAR = "BAR"
    WAITER = "WAITER"


class FulfillmentSector(str, Enum):
    KITCHEN = "KITCHEN"
    BAR = "BAR"
    WAITER = "WAITER"


class OrderStatus(str, Enum):
    RECEIVED = "RECEIVED"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    DELIVERED = "DELIVERED"


class TableSessionStatus(str, Enum):
    OPEN = "OPEN"
    MESA_OCUPADA = "MESA_OCUPADA"
    CON_PEDIDO = "CON_PEDIDO"
    CLOSED = "CLOSED"
    SE_RETIRARON = "SE_RETIRARON"


class BillSplitStatus(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class BillPartPaymentStatus(str, Enum):
    PENDING = "PENDING"
    REPORTED = "REPORTED"
    CONFIRMED = "CONFIRMED"


class CashRequestStatus(str, Enum):
    PENDING = "PENDING"
    RESOLVED = "RESOLVED"


class CashRequestKind(str, Enum):
    WAITER_CALL = "WAITER_CALL"
    CASH_PAYMENT = "CASH_PAYMENT"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    show_live_total_to_client: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    print_mode: Mapped[str] = mapped_column(String(20), default="MANUAL", nullable=False)
    whatsapp_share_template: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    theme_preset: Mapped[str] = mapped_column(String(20), default="CLASSIC", nullable=False)
    accent_color: Mapped[str] = mapped_column(String(20), default="ROJO", nullable=False)
    show_watermark_logo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Table(Base):
    __tablename__ = "tables"
    __table_args__ = (UniqueConstraint("store_id", "code", name="uq_tables_store_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    orders: Mapped[list["Order"]] = relationship(back_populates="table")
    sessions: Mapped[list["TableSession"]] = relationship(back_populates="table")


class TableSession(Base):
    __tablename__ = "table_sessions"
    __table_args__ = (CheckConstraint("guest_count > 0", name="ck_table_sessions_guest_count_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), nullable=False)
    guest_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=TableSessionStatus.MESA_OCUPADA.value, nullable=False)
    closed_shift_id: Mapped[int | None] = mapped_column(ForeignKey("service_shifts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    table: Mapped["Table"] = relationship(back_populates="sessions")
    orders: Mapped[list["Order"]] = relationship(back_populates="table_session")


class TableSessionClient(Base):
    __tablename__ = "table_session_clients"
    __table_args__ = (UniqueConstraint("table_session_id", "client_id", name="uq_table_session_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_session_id: Mapped[int] = mapped_column(ForeignKey("table_sessions.id"), nullable=False)
    client_id: Mapped[str] = mapped_column(String(120), nullable=False)
    alias: Mapped[str | None] = mapped_column(String(100))
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class TableSessionFeedback(Base):
    __tablename__ = "table_session_feedback"
    __table_args__ = (UniqueConstraint("table_session_id", "client_id", name="uq_table_session_feedback_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_session_id: Mapped[int] = mapped_column(ForeignKey("table_sessions.id"), nullable=False)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    client_id: Mapped[str] = mapped_column(String(120), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class MenuCategory(Base):
    __tablename__ = "menu_categories"
    __table_args__ = (UniqueConstraint("store_id", "name", name="uq_menu_categories_store_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("menu_categories.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    base_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    fulfillment_sector: Mapped[str] = mapped_column(String(20), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product")
    extra_options: Mapped[list["ProductExtraOption"]] = relationship(back_populates="product")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    extra_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="variants")


class ProductExtraOption(Base):
    __tablename__ = "product_extra_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    extra_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="extra_options")


class StaffAccount(Base):
    __tablename__ = "staff_accounts"
    __table_args__ = (UniqueConstraint("store_id", "username", name="uq_staff_store_username"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    sector: Mapped[str] = mapped_column(String(20), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ServiceShift(Base):
    __tablename__ = "service_shifts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    operator_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)
    opened_by_staff_id: Mapped[int] = mapped_column(ForeignKey("staff_accounts.id"), nullable=False)
    closed_by_staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff_accounts.id"))
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    summary_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("store_id", "ticket_number", name="uq_orders_store_ticket"),
        CheckConstraint("guest_count > 0", name="ck_orders_guest_count_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), nullable=False)
    table_session_id: Mapped[int | None] = mapped_column(ForeignKey("table_sessions.id"))
    guest_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ticket_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status_aggregated: Mapped[str] = mapped_column(String(20), nullable=False)
    printed_full_at: Mapped[datetime | None] = mapped_column(DateTime)
    printed_kitchen_at: Mapped[datetime | None] = mapped_column(DateTime)
    printed_bar_at: Mapped[datetime | None] = mapped_column(DateTime)
    printed_waiter_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    table: Mapped["Table"] = relationship(back_populates="orders")
    table_session: Mapped["TableSession | None"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")
    sector_statuses: Mapped[list["OrderSectorStatus"]] = relationship(back_populates="order")
    bill_splits: Mapped[list["BillSplit"]] = relationship(back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("qty > 0", name="ck_order_items_qty_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id"))
    created_by_client_id: Mapped[str | None] = mapped_column(String(120))
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    sector: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=OrderStatus.RECEIVED.value, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


class OrderSectorStatus(Base):
    __tablename__ = "order_sector_status"
    __table_args__ = (UniqueConstraint("order_id", "sector", name="uq_order_sector_status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    sector: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    updated_by_staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff_accounts.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="sector_statuses")


class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    sector: Mapped[str] = mapped_column(String(20), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by_staff_id: Mapped[int] = mapped_column(ForeignKey("staff_accounts.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ItemStatusEvent(Base):
    __tablename__ = "item_status_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id"), nullable=False)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    sector: Mapped[str] = mapped_column(String(20), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by_staff_id: Mapped[int] = mapped_column(ForeignKey("staff_accounts.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class BillSplit(Base):
    __tablename__ = "bill_splits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="EQUAL", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=BillSplitStatus.OPEN.value, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    order: Mapped["Order"] = relationship(back_populates="bill_splits")
    parts: Mapped[list["BillSplitPart"]] = relationship(back_populates="bill_split")


class BillSplitPart(Base):
    __tablename__ = "bill_split_parts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bill_split_id: Mapped[int] = mapped_column(ForeignKey("bill_splits.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(20), default=BillPartPaymentStatus.PENDING.value, nullable=False)
    reported_by: Mapped[str | None] = mapped_column(String(120))
    reported_at: Mapped[datetime | None] = mapped_column(DateTime)
    confirmed_by_staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff_accounts.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    bill_split: Mapped["BillSplit"] = relationship(back_populates="parts")


class TableSessionCashRequest(Base):
    __tablename__ = "table_session_cash_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_session_id: Mapped[int] = mapped_column(ForeignKey("table_sessions.id"), nullable=False)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    store_id: Mapped[int] = mapped_column(ForeignKey("stores.id"), nullable=False)
    client_id: Mapped[str] = mapped_column(String(120), nullable=False)
    payer_label: Mapped[str] = mapped_column(String(120), nullable=False)
    request_kind: Mapped[str] = mapped_column(String(20), default=CashRequestKind.CASH_PAYMENT.value, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=CashRequestStatus.PENDING.value, nullable=False)
    resolved_by_staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff_accounts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
