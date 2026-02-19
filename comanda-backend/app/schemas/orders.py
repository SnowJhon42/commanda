from datetime import datetime

from pydantic import BaseModel, Field


class CreateOrderItemIn(BaseModel):
    product_id: int
    variant_id: int | None = None
    qty: int = Field(..., gt=0)
    notes: str | None = None


class CreateOrderRequest(BaseModel):
    tenant_id: int
    store_id: int
    table_code: str
    guest_count: int = Field(..., gt=0)
    items: list[CreateOrderItemIn]


class OpenTableSessionRequest(BaseModel):
    store_id: int
    table_code: str
    guest_count: int = Field(1, gt=0)


class OpenTableSessionResponse(BaseModel):
    table_session_id: int
    store_id: int
    table_code: str
    status: str
    active_order_id: int | None = None


class JoinTableSessionRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=120)
    alias: str | None = Field(default=None, max_length=100)


class JoinTableSessionResponse(BaseModel):
    table_session_id: int
    client_id: str
    alias: str | None = None
    connected_clients: int


class UpsertOrderByTableRequest(BaseModel):
    tenant_id: int
    store_id: int
    table_session_id: int
    guest_count: int = Field(..., gt=0)
    items: list[CreateOrderItemIn]


class TableSessionStateResponse(BaseModel):
    table_session_id: int
    store_id: int
    table_code: str
    status: str
    connected_clients: int
    active_order_id: int | None = None


class CloseTableSessionResponse(BaseModel):
    table_session_id: int
    table_code: str
    status: str
    closed_at: datetime


class CreateEqualBillSplitRequest(BaseModel):
    parts_count: int = Field(..., ge=2, le=20)


class ReportBillPartPaymentRequest(BaseModel):
    payer_label: str = Field(..., min_length=1, max_length=120)


class BillSplitPartOut(BaseModel):
    id: int
    label: str
    amount: float
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
    sectors: list[SectorStatusOut]


class OrderItemOut(BaseModel):
    id: int
    product_name: str
    qty: int
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
    sectors: list[SectorStatusOut]
    created_at: datetime


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
    sector: str
    status: str
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
    total_amount: float
    delivered_items: int
    total_items: int
    delays: list[AdminSectorDelayOut]
    items: list[StaffBoardItemOut]
    events: list[ItemStatusEventOut]
    bill_split: BillSplitOut | None = None
    created_at: datetime
