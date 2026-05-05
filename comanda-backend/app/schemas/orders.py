from datetime import datetime

from pydantic import BaseModel, Field


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
    table_elapsed_minutes: int = 0
    order_elapsed_minutes: int = 0
    created_at: datetime
