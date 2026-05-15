from datetime import datetime

from pydantic import BaseModel, Field, field_validator

FISCAL_TAX_STATUS_CHOICES = {"CONSUMIDOR_FINAL", "RESPONSABLE_INSCRIPTO", "MONOTRIBUTISTA", "EXENTO"}
FISCAL_DOCUMENT_TYPE_CHOICES = {"DNI", "CUIT"}
STORE_FISCAL_TAX_STATUS_CHOICES = {"RESPONSABLE_INSCRIPTO", "MONOTRIBUTISTA", "EXENTO"}
STORE_FISCAL_SETUP_STATUS_CHOICES = {"NOT_CONFIGURED", "INCOMPLETE", "READY_TO_INTEGRATE"}
FISCAL_INTEGRATION_PROVIDER_CHOICES = {"MANUAL_DEMO", "ARCA_DIRECT", "EXTERNAL_API"}


def normalize_fiscal_tax_status(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in FISCAL_TAX_STATUS_CHOICES:
        raise ValueError("unsupported fiscal tax status")
    return normalized


def normalize_document_type(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in FISCAL_DOCUMENT_TYPE_CHOICES:
        raise ValueError("unsupported fiscal document type")
    return normalized


def normalize_store_fiscal_tax_status(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in STORE_FISCAL_TAX_STATUS_CHOICES:
        raise ValueError("unsupported store fiscal tax status")
    return normalized


def normalize_store_point_of_sale(value: str | None) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    if not candidate.isdigit():
        raise ValueError("point of sale must be numeric")
    if len(candidate) > 5:
        raise ValueError("point of sale too long")
    return candidate


def normalize_optional_email(value: str | None) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    if "@" not in candidate or "." not in candidate.split("@")[-1]:
        raise ValueError("invalid email")
    return candidate


def normalize_fiscal_integration_provider(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in FISCAL_INTEGRATION_PROVIDER_CHOICES:
        raise ValueError("unsupported fiscal integration provider")
    return normalized


class FiscalInvoiceDraftOut(BaseModel):
    requested: bool = False
    customer_tax_status: str | None = None
    customer_document_type: str | None = None
    customer_document_number: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    suggested_invoice_type: str | None = None
    issue_mode: str = "ELECTRONIC"
    ready_to_issue: bool = False


class FiscalInvoiceDraftUpdateIn(BaseModel):
    requested: bool = True
    customer_tax_status: str
    customer_document_type: str
    customer_document_number: str
    customer_name: str
    customer_email: str

    @field_validator("customer_tax_status")
    @classmethod
    def validate_customer_tax_status(cls, value: str) -> str:
        return normalize_fiscal_tax_status(value)

    @field_validator("customer_document_type")
    @classmethod
    def validate_document_type(cls, value: str) -> str:
        return normalize_document_type(value)

    @field_validator("customer_document_number", "customer_name", "customer_email")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        candidate = str(value or "").strip()
        if not candidate:
            raise ValueError("required field")
        return candidate


class StoreFiscalProfileOut(BaseModel):
    business_name: str | None = None
    tax_id: str | None = None
    tax_status: str
    point_of_sale: str | None = None
    issuer_email: str | None = None
    setup_status: str = "NOT_CONFIGURED"
    integration_provider: str = "MANUAL_DEMO"


class FiscalDocumentOut(BaseModel):
    id: int
    document_kind: str = "INVOICE"
    invoice_type: str | None = None
    issue_mode: str = "ELECTRONIC"
    status: str = "DRAFT"
    point_of_sale: str | None = None
    invoice_number: str | None = None
    cae: str | None = None
    cae_due_date: datetime | None = None
    request_payload: dict = Field(default_factory=dict)
    response_payload: dict = Field(default_factory=dict)
    last_error: str | None = None
    email_delivery_status: str = "PENDING"
    email_send_count: int = 0
    email_last_sent_at: datetime | None = None
    email_last_error: str | None = None
    issued_at: datetime | None = None
    canceled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class FiscalDocumentUpdateIn(BaseModel):
    status: str = Field(..., pattern="^(DRAFT|READY_TO_ISSUE|ISSUED|ERROR|CANCELED)$")
    invoice_number: str | None = Field(default=None, max_length=30)
    cae: str | None = Field(default=None, max_length=32)
    cae_due_date: datetime | None = None
    response_payload: dict = Field(default_factory=dict)
    last_error: str | None = Field(default=None, max_length=4000)


class FiscalDocumentIssueOut(BaseModel):
    provider: str
    mode: str = "DEMO"
    document: FiscalDocumentOut
    fiscal_valid: bool = False
    message: str


class FiscalDocumentHistoryItemOut(BaseModel):
    document_id: int
    order_id: int
    table_code: str | None = None
    ticket_number: int | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    invoice_type: str | None = None
    status: str
    provider: str = "MANUAL_DEMO"
    fiscal_valid: bool = False
    invoice_number: str | None = None
    cae: str | None = None
    email_delivery_status: str = "PENDING"
    email_send_count: int = 0
    email_last_sent_at: datetime | None = None
    issued_at: datetime | None = None
    updated_at: datetime


class FiscalDocumentsHistoryResponse(BaseModel):
    total: int
    items: list[FiscalDocumentHistoryItemOut]


class FiscalDocumentEmailOut(BaseModel):
    document_id: int
    mode: str
    delivered: bool = False
    message: str
    email_delivery_status: str
    email_send_count: int = 0
    email_last_sent_at: datetime | None = None
    email_last_error: str | None = None


class FiscalMailConfigOut(BaseModel):
    mode: str = "SIMULATED"
    smtp_configured: bool = False
    from_email: str | None = None
    host: str | None = None
    port: int | None = None
    use_tls: bool = True


class CreateOrderItemIn(BaseModel):
    product_id: int
    variant_id: int | None = None
    extra_option_ids: list[int] = Field(default_factory=list)
    qty: int = Field(..., gt=0)
    notes: str | None = None


class CreateOrderRequest(BaseModel):
    tenant_id: int
    store_id: int
    table_code: str
    guest_count: int = Field(..., gt=0)
    service_mode: str = Field("RESTAURANTE", pattern="^(RESTAURANTE|BAR)$")
    items: list[CreateOrderItemIn]


class OpenTableSessionRequest(BaseModel):
    store_id: int
    table_code: str
    guest_count: int = Field(1, gt=0)
    service_mode: str = Field("RESTAURANTE", pattern="^(RESTAURANTE|BAR)$")


class OpenTableSessionResponse(BaseModel):
    table_session_id: int
    store_id: int
    table_code: str
    guest_count: int
    status: str
    service_mode: str = "RESTAURANTE"
    active_order_id: int | None = None


class JoinTableSessionRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=120)
    alias: str | None = Field(default=None, max_length=100)


class JoinTableSessionResponse(BaseModel):
    table_session_id: int
    client_id: str
    alias: str | None = None
    connected_clients: int
    table_session_token: str


class UpsertOrderByTableRequest(BaseModel):
    tenant_id: int
    store_id: int
    table_session_id: int
    client_id: str | None = Field(default=None, min_length=1, max_length=120)
    guest_count: int = Field(..., gt=0)
    service_mode: str = Field("RESTAURANTE", pattern="^(RESTAURANTE|BAR)$")
    items: list[CreateOrderItemIn]


class TableSessionStateResponse(BaseModel):
    table_session_id: int
    store_id: int
    table_code: str
    guest_count: int
    status: str
    service_mode: str = "RESTAURANTE"
    checkout_status: str = "NONE"
    connected_clients: int
    active_order_id: int | None = None
    assistance_request_kind: str | None = None
    assistance_request_status: str | None = None
    assistance_request_note: str | None = None
    assistance_message: str | None = None


class TableSessionConsumptionItemOut(BaseModel):
    item_id: int
    order_id: int
    product_name: str
    qty: int
    unit_price: float
    created_by_client_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    notes: str | None = None
    sector: str
    status: str


class TableSessionConsumptionResponse(BaseModel):
    table_session_id: int
    table_code: str
    guest_count: int
    order_ids: list[int]
    items: list[TableSessionConsumptionItemOut]


class StaffTableSessionOut(BaseModel):
    table_session_id: int
    table_code: str
    guest_count: int
    status: str
    service_mode: str = "RESTAURANTE"
    checkout_status: str = "NONE"
    connected_clients: int
    active_order_id: int | None = None
    active_order_created_at: datetime | None = None
    elapsed_minutes: int = 0
    created_at: datetime


class StaffTableSessionsResponse(BaseModel):
    total: int
    items: list[StaffTableSessionOut]


class StaffTableOut(BaseModel):
    table_id: int
    table_code: str
    active: bool
    current_status: str
    service_mode: str = "RESTAURANTE"
    active_table_session_id: int | None = None
    guest_count: int = 0
    connected_clients: int = 0
    active_order_id: int | None = None
    active_order_created_at: datetime | None = None
    elapsed_minutes: int = 0


class StaffTablesResponse(BaseModel):
    total: int
    items: list[StaffTableOut]


class CreateStaffTableRequest(BaseModel):
    table_code: str | None = Field(default=None, min_length=1, max_length=30)


class CreateStaffTableResponse(BaseModel):
    table_id: int
    table_code: str
    active: bool


class ChangeTableSessionStatusRequest(BaseModel):
    to_status: str


class ChangeTableSessionStatusResponse(BaseModel):
    table_session_id: int
    previous_status: str
    current_status: str
    updated_by_staff_id: int


class MoveTableSessionRequest(BaseModel):
    target_table_code: str = Field(..., min_length=1, max_length=30)


class MoveTableSessionResponse(BaseModel):
    table_session_id: int
    previous_table_code: str
    current_table_code: str
    moved_order_ids: list[int]
    updated_by_staff_id: int


class StoreClientVisibilityResponse(BaseModel):
    store_id: int
    show_live_total_to_client: bool


class UpdateStoreClientVisibilityRequest(BaseModel):
    show_live_total_to_client: bool


class StorePrintSettingsResponse(BaseModel):
    store_id: int
    print_mode: str


class UpdateStorePrintSettingsRequest(BaseModel):
    print_mode: str = Field(..., pattern="^(MANUAL|AUTOMATIC)$")


class StoreMessagingSettingsResponse(BaseModel):
    store_id: int
    restaurant_name: str
    whatsapp_share_template: str | None = None


class UpdateStoreMessagingSettingsRequest(BaseModel):
    whatsapp_share_template: str = Field(..., min_length=1, max_length=2000)


class StoreProfileResponse(BaseModel):
    store_id: int
    restaurant_name: str
    owner_password_configured: bool = False
    logo_url: str | None = None
    cover_image_url: str | None = None
    theme_preset: str = "CLASSIC"
    accent_color: str = "ROJO"
    background_color: str = "ROJO"
    background_image_url: str | None = None
    show_watermark_logo: bool = False
    payment_cash_enabled: bool = True
    payment_transfer_enabled: bool = True
    payment_card_enabled: bool = True
    payment_mercado_pago_enabled: bool = True
    payment_modo_enabled: bool = True
    payment_transfer_instructions: str | None = None
    fiscal_business_name: str | None = None
    fiscal_tax_id: str | None = None
    fiscal_tax_status: str = "RESPONSABLE_INSCRIPTO"
    fiscal_point_of_sale: str | None = None
    fiscal_issuer_email: str | None = None
    fiscal_integration_provider: str = "MANUAL_DEMO"
    fiscal_setup_status: str = "NOT_CONFIGURED"
    fiscal_setup_missing_fields: list[str] = []


class StaffAccountOut(BaseModel):
    id: int
    display_name: str
    username: str
    sector: str
    active: bool
    created_at: datetime


class StaffAccountsResponse(BaseModel):
    items: list[StaffAccountOut]


class CreateStaffAccountRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)
    username: str = Field(..., min_length=1, max_length=100)
    pin: str = Field(..., min_length=4, max_length=200)
    sector: str = Field(..., pattern="^(ADMIN|KITCHEN|BAR|WAITER)$")
    active: bool = True


class UpdateStaffAccountRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    pin: str | None = Field(default=None, min_length=4, max_length=200)
    active: bool | None = None


class StoreFloorPlanZoneOut(BaseModel):
    id: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)


class StoreFloorPlanItemOut(BaseModel):
    table_code: str = Field(..., min_length=1, max_length=30)
    zone_id: str = Field(..., min_length=1, max_length=80)
    x: float = Field(..., ge=0, le=5000)
    y: float = Field(..., ge=0, le=5000)
    width: float = Field(..., gt=20, le=800)
    height: float = Field(..., gt=20, le=800)
    shape: str = Field(..., pattern="^(SQUARE|RECT|CIRCLE)$")


class StoreFloorPlanResponse(BaseModel):
    store_id: int
    zones: list[StoreFloorPlanZoneOut]
    items: list[StoreFloorPlanItemOut]


class UpdateStoreFloorPlanRequest(BaseModel):
    zones: list[StoreFloorPlanZoneOut]
    items: list[StoreFloorPlanItemOut]


class UpdateStoreProfileRequest(BaseModel):
    owner_password: str = Field(..., min_length=1, max_length=200)
    new_owner_password: str | None = Field(default=None, min_length=4, max_length=200)
    restaurant_name: str = Field(..., min_length=1, max_length=255)
    logo_url: str | None = Field(default=None, max_length=2048)
    cover_image_url: str | None = Field(default=None, max_length=2048)
    theme_preset: str = Field("CLASSIC", pattern="^(CLASSIC|MODERN|PREMIUM)$")
    accent_color: str = Field("ROJO", pattern="^(ROJO|VERDE|DORADO|AZUL|NEGRO)$")
    background_color: str = Field("ROJO", pattern="^(ROJO|VERDE|DORADO|AZUL|NEGRO)$")
    background_image_url: str | None = Field(default=None, max_length=2048)
    show_watermark_logo: bool = False
    payment_cash_enabled: bool = True
    payment_transfer_enabled: bool = True
    payment_card_enabled: bool = True
    payment_mercado_pago_enabled: bool = True
    payment_modo_enabled: bool = True
    payment_transfer_instructions: str | None = Field(default=None, max_length=2000)
    fiscal_business_name: str | None = Field(default=None, max_length=255)
    fiscal_tax_id: str | None = Field(default=None, max_length=32)
    fiscal_tax_status: str = Field("RESPONSABLE_INSCRIPTO")
    fiscal_point_of_sale: str | None = Field(default=None, max_length=5)
    fiscal_issuer_email: str | None = Field(default=None, max_length=255)
    fiscal_integration_provider: str = Field("MANUAL_DEMO")

    @field_validator("fiscal_tax_status")
    @classmethod
    def validate_store_tax_status(cls, value: str) -> str:
        return normalize_store_fiscal_tax_status(value)

    @field_validator("fiscal_point_of_sale")
    @classmethod
    def validate_store_point_of_sale(cls, value: str | None) -> str | None:
        return normalize_store_point_of_sale(value)

    @field_validator("fiscal_issuer_email")
    @classmethod
    def validate_fiscal_issuer_email(cls, value: str | None) -> str | None:
        return normalize_optional_email(value)

    @field_validator("fiscal_integration_provider")
    @classmethod
    def validate_fiscal_integration_provider(cls, value: str) -> str:
        return normalize_fiscal_integration_provider(value)


class StoreThemeSuggestionRequest(BaseModel):
    restaurant_name: str = Field(..., min_length=1, max_length=255)
    logo_url: str | None = Field(default=None, max_length=2048)
    cover_image_url: str | None = Field(default=None, max_length=2048)


class StoreThemeSuggestionResponse(BaseModel):
    theme_preset: str
    accent_color: str
    show_watermark_logo: bool
    reason: str


class OpenShiftRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    operator_name: str = Field(..., min_length=1, max_length=120)


class BootstrapShiftRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    operator_name: str = Field(..., min_length=1, max_length=120)
    opening_float: float = Field(0, ge=0, le=100000000)
    note: str | None = Field(default=None, max_length=500)


class OpenCashSessionRequest(BaseModel):
    opening_float: float = Field(0, ge=0, le=100000000)
    note: str | None = Field(default=None, max_length=500)


class CloseCashSessionRequest(BaseModel):
    declared_amount: float = Field(..., ge=0, le=100000000)
    note: str | None = Field(default=None, max_length=500)


class CollectOrderPaymentRequest(BaseModel):
    payment_method: str = Field(..., pattern="^(CASH|CARD|TRANSFER|OTHER)$")
    amount: float = Field(..., gt=0, le=100000000)
    note: str | None = Field(default=None, max_length=500)


class ShiftClosedTableOut(BaseModel):
    table_code: str
    guest_count: int
    total_amount: float
    duration_minutes: int
    closed_at: datetime | None = None


class ShiftPaymentMethodSummaryOut(BaseModel):
    payment_method: str
    total_amount: float
    payments_count: int


class HistoricalSectorAverageOut(BaseModel):
    sector: str
    cases_count: int
    avg_duration_minutes: int


class HistoricalServiceTimesOut(BaseModel):
    avg_table_duration_minutes: int = 0
    closed_tables_count: int = 0
    sector_averages: list[HistoricalSectorAverageOut] = []


class ShiftPendingOrderOut(BaseModel):
    order_id: int
    table_code: str
    guest_count: int
    total_amount: float
    paid_amount: float
    balance_due: float
    created_at: datetime


class CashSessionOut(BaseModel):
    id: int
    store_id: int
    service_shift_id: int | None = None
    status: str
    opening_float: float
    collected_amount: float = 0
    cash_collected_amount: float = 0
    expected_amount: float = 0
    declared_amount: float | None = None
    difference_amount: float = 0
    note: str | None = None
    opened_by_staff_id: int
    closed_by_staff_id: int | None = None
    opened_at: datetime
    closed_at: datetime | None = None


class ShiftSummaryOut(BaseModel):
    closed_covers: int = 0
    closed_tables: int = 0
    total_revenue: float = 0
    collected_total: float = 0
    avg_duration_minutes: int = 0
    avg_rating: float = 0
    feedback_count: int = 0
    closed_table_details: list[ShiftClosedTableOut] = []
    payment_totals: list[ShiftPaymentMethodSummaryOut] = []
    pending_orders: list[ShiftPendingOrderOut] = []
    pending_orders_count: int = 0
    cash_session: CashSessionOut | None = None
    top_products: list[dict] = []
    top_beverages: list[dict] = []
    historical_service_times: HistoricalServiceTimesOut = HistoricalServiceTimesOut()


class StaffShiftOut(BaseModel):
    id: int
    store_id: int
    label: str
    operator_name: str
    status: str
    opened_by_staff_id: int
    closed_by_staff_id: int | None = None
    opened_at: datetime
    closed_at: datetime | None = None


class ActiveShiftResponse(BaseModel):
    active_shift: StaffShiftOut | None = None
    summary: ShiftSummaryOut = ShiftSummaryOut()


class CloseShiftResponse(BaseModel):
    closed_shift: StaffShiftOut
    summary: ShiftSummaryOut


class CashSessionResponse(BaseModel):
    cash_session: CashSessionOut
    summary: ShiftSummaryOut


class ShiftHistoryItemOut(BaseModel):
    shift: StaffShiftOut
    summary: ShiftSummaryOut


class ShiftHistoryResponse(BaseModel):
    items: list[ShiftHistoryItemOut]


class CloseTableSessionResponse(BaseModel):
    table_session_id: int
    table_code: str
    status: str
    closed_at: datetime


class RestaurantCheckoutResponse(BaseModel):
    table_session_id: int
    table_code: str
    checkout_status: str


class ForceCloseTableSessionResponse(BaseModel):
    table_session_id: int
    table_code: str
    status: str
    closed_at: datetime
    forced: bool = True


class TableSessionFeedbackRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=120)
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = Field(default=None, max_length=500)


class TableSessionFeedbackResponse(BaseModel):
    table_session_id: int
    client_id: str
    rating: int
    comment: str | None = None
    created_at: datetime
    updated_at: datetime


class FeedbackDistributionOut(BaseModel):
    rating: int
    count: int


class FeedbackCommentOut(BaseModel):
    table_session_id: int
    table_code: str
    client_id: str
    rating: int
    comment: str
    created_at: datetime


class FeedbackSummaryResponse(BaseModel):
    avg_rating: float
    total_feedbacks: int
    distribution: list[FeedbackDistributionOut]
    latest_comments: list[FeedbackCommentOut]


class CreateEqualBillSplitRequest(BaseModel):
    parts_count: int = Field(..., ge=1, le=20)


class CreateConsumptionBillSplitRequest(BaseModel):
    fallback_label: str = Field(default="Consumo compartido", min_length=1, max_length=120)


class ReportBillPartPaymentRequest(BaseModel):
    payer_label: str = Field(..., min_length=1, max_length=120)
    payment_method: str = Field(..., pattern="^(CASH|CARD|MERCADO_PAGO|MODO|TRANSFER|OTHER)$")


class RequestCashPaymentRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=120)
    payer_label: str = Field(..., min_length=1, max_length=120)
    request_kind: str = Field(default="CASH_PAYMENT", pattern="^(WAITER_CALL|CASH_PAYMENT|TRANSFER_PAYMENT|POSNET_PAYMENT)$")
    note: str | None = Field(default=None, max_length=250)


class TableSessionCashRequestOut(BaseModel):
    id: int
    table_session_id: int
    order_id: int | None = None
    client_id: str
    payer_label: str
    request_kind: str = "CASH_PAYMENT"
    note: str | None = None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by_staff_id: int | None = None


class BillSplitPartOut(BaseModel):
    id: int
    label: str
    amount: float
    payment_method: str
    payment_status: str
    reported_by: str | None = None
    reported_at: datetime | None = None
    confirmed_by_staff_id: int | None = None
    confirmed_at: datetime | None = None


class BillSplitOut(BaseModel):
    id: int
    order_id: int
    mode: str
    status: str
    total_amount: float
    created_at: datetime
    closed_at: datetime | None = None
    parts: list[BillSplitPartOut]


class SectorStatusOut(BaseModel):
    sector: str
    status: str


class CreateOrderResponse(BaseModel):
    order_id: int
    ticket_number: int
    status_aggregated: str
    review_status: str = "APPROVED"
    service_mode: str = "RESTAURANTE"
    payment_gate: str = "NONE"
    payment_status: str = "CONFIRMED"
    sectors: list[SectorStatusOut]


class OrderItemOut(BaseModel):
    id: int
    product_name: str
    qty: int
    unit_price: float
    created_by_client_id: str | None = None
    created_at: datetime | None = None
    notes: str | None = None
    sector: str
    status: str


class OrderSectorDetailOut(BaseModel):
    sector: str
    status: str
    updated_at: datetime


class OrderDetailResponse(BaseModel):
    id: int
    tenant_id: int
    store_id: int
    table_code: str
    guest_count: int
    ticket_number: int
    status_aggregated: str
    review_status: str = "APPROVED"
    service_mode: str = "RESTAURANTE"
    payment_gate: str = "NONE"
    payment_status: str = "CONFIRMED"
    sectors: list[OrderSectorDetailOut]
    items: list[OrderItemOut]
    created_at: datetime


class StaffOrderOut(BaseModel):
    order_id: int
    table_code: str
    sector: str
    sector_status: str
    status_aggregated: str
    created_at: datetime


class StaffOrdersResponse(BaseModel):
    total: int
    items: list[StaffOrderOut]


class ChangeSectorStatusRequest(BaseModel):
    to_status: str


class ChangeSectorStatusResponse(BaseModel):
    order_id: int
    sector: str
    previous_status: str
    current_status: str
    status_aggregated: str
    updated_by_staff_id: int
    updated_at: datetime


class AdminOrderSummaryOut(BaseModel):
    order_id: int
    table_code: str
    guest_count: int
    total_items: int
    delivered_items: int
    total_amount: float
    status_aggregated: str
    review_status: str = "APPROVED"
    has_pending_payment: bool = False
    is_active_session: bool = False
    sectors: list[SectorStatusOut]
    elapsed_minutes: int = 0
    created_at: datetime
    updated_at: datetime
    bill_split_closed: bool = False
    payment_confirmed: bool = False
    service_mode: str = "RESTAURANTE"
    payment_gate: str = "NONE"
    payment_status: str = "CONFIRMED"
    reported_payment_method: str | None = None
    print_status: "OrderPrintStatusOut"


class ConfirmBarOrderPaymentResponse(BaseModel):
    order_id: int
    review_status: str = "APPROVED"
    service_mode: str
    payment_gate: str
    payment_status: str
    confirmed_by_staff_id: int


class ReviewOrderResponse(BaseModel):
    order_id: int
    review_status: str
    reviewed_by_staff_id: int


class CollectOrderPaymentResponse(BaseModel):
    order_id: int
    payment_id: int
    payment_method: str
    amount: float
    total_paid: float
    balance_due: float
    payment_confirmed: bool


class AdminOrdersResponse(BaseModel):
    total: int
    items: list[AdminOrderSummaryOut]


class StaffBoardItemOut(BaseModel):
    item_id: int
    order_id: int
    table_code: str
    guest_count: int
    item_name: str
    qty: int
    unit_price: float = 0
    vat_rate: float = 21
    notes: str | None = None
    sector: str
    status: str
    review_status: str = "APPROVED"
    service_mode: str = "RESTAURANTE"
    payment_gate: str = "NONE"
    payment_status: str = "CONFIRMED"
    created_at: datetime
    updated_at: datetime


class StaffBoardItemsResponse(BaseModel):
    total: int
    items: list[StaffBoardItemOut]


class ChangeItemStatusRequest(BaseModel):
    to_status: str


class ChangeItemStatusResponse(BaseModel):
    item_id: int
    order_id: int
    sector: str
    previous_status: str
    current_status: str
    status_aggregated: str
    updated_by_staff_id: int
    updated_at: datetime


class OrderPrintSectorStateOut(BaseModel):
    sector: str
    required: bool
    status: str
    printed_at: datetime | None = None


class OrderPrintStatusOut(BaseModel):
    overall_status: str
    full_status: str
    full_printed_at: datetime | None = None
    commands_status: str
    sectors: list[OrderPrintSectorStateOut]


class MarkOrderPrintRequest(BaseModel):
    target: str = Field(..., pattern="^(FULL|COMMANDS|KITCHEN|BAR|WAITER)$")


class MarkOrderPrintResponse(BaseModel):
    order_id: int
    touched_targets: list[str]
    print_status: OrderPrintStatusOut


class AdminSectorDelayOut(BaseModel):
    sector: str
    waiting_items: int
    oldest_waiting_minutes: int


class ItemStatusEventOut(BaseModel):
    id: int
    item_id: int
    sector: str
    from_status: str | None
    to_status: str
    changed_by_staff_id: int
    created_at: datetime


class AdminOrderItemsDetailResponse(BaseModel):
    order_id: int
    table_session_id: int | None = None
    table_code: str
    guest_count: int
    ticket_number: int
    status_aggregated: str
    review_status: str = "APPROVED"
    total_amount: float
    delivered_items: int
    total_items: int
    delays: list[AdminSectorDelayOut]
    items: list[StaffBoardItemOut]
    events: list[ItemStatusEventOut]
    bill_split: BillSplitOut | None = None
    cash_requests: list[TableSessionCashRequestOut] = []
    print_status: "OrderPrintStatusOut"
    store_fiscal_profile: StoreFiscalProfileOut
    fiscal_invoice_draft: FiscalInvoiceDraftOut | None = None
    fiscal_document: FiscalDocumentOut | None = None
    table_elapsed_minutes: int = 0
    order_elapsed_minutes: int = 0
    created_at: datetime
