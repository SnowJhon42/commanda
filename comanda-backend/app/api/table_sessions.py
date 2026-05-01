from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import TableClientContext, get_current_table_client
from app.core.security import create_table_session_token
from app.db.models import (
    CashRequestKind,
    CashRequestStatus,
    Order,
    OrderItem,
    OrderPaymentStatus,
    OrderReviewStatus,
    OrderStatus,
    PaymentGate,
    Product,
    ProductExtraOption,
    ProductVariant,
    ServiceMode,
    Store,
    Table,
    TableSession,
    TableSessionCashRequest,
    TableSessionClient,
    TableSessionFeedback,
    TableSessionStatus,
)
from app.db.session import get_db
from app.schemas.orders import (
    CreateOrderResponse,
    JoinTableSessionRequest,
    JoinTableSessionResponse,
    OpenTableSessionRequest,
    OpenTableSessionResponse,
    SectorStatusOut,
    TableSessionStateResponse,
    TableSessionConsumptionItemOut,
    TableSessionConsumptionResponse,
    TableSessionFeedbackRequest,
    TableSessionFeedbackResponse,
    RestaurantCheckoutResponse,
    UpsertOrderByTableRequest,
)
from app.services.item_status import recompute_order_status_from_items
from app.services.order_creation import add_items_to_order
from app.services.billing import get_latest_bill_split, sync_open_split_to_order_total
from app.services.realtime import event_bus
from app.services.table_code import normalize_table_code
from app.services.ticket_generator import next_ticket_number

router = APIRouter(tags=["table-session"])
ACTIVE_TABLE_SESSION_STATUSES = (
    TableSessionStatus.OPEN.value,
    TableSessionStatus.MESA_OCUPADA.value,
    TableSessionStatus.CON_PEDIDO.value,
)
RESTAURANT_CHECKOUT_NONE = "NONE"
RESTAURANT_CHECKOUT_REQUESTED = "REQUESTED"
RESTAURANT_CHECKOUT_READY = "READY"


def _order_flow_defaults(service_mode: str) -> tuple[str, str]:
    if service_mode == ServiceMode.BAR.value:
        return OrderReviewStatus.PENDING.value, PaymentGate.BEFORE_PREPARATION.value
    return OrderReviewStatus.APPROVED.value, PaymentGate.NONE.value


def _active_order_for_session(db: Session, *, table_session_id: int, store_id: int) -> Order | None:
    return db.scalar(
        select(Order)
        .where(
            Order.store_id == store_id,
            Order.table_session_id == table_session_id,
            Order.status_aggregated != OrderStatus.DELIVERED.value,
            Order.review_status != OrderReviewStatus.REJECTED.value,
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(1)
    )


def _should_create_new_session_order(existing_order: Order | None, requested_service_mode: str) -> bool:
    if not existing_order:
        return False
    if existing_order.review_status != OrderReviewStatus.PENDING.value:
        return True
    return existing_order.service_mode != requested_service_mode


@router.post("/table/session/open", response_model=OpenTableSessionResponse)
def open_table_session(payload: OpenTableSessionRequest, db: Session = Depends(get_db)) -> OpenTableSessionResponse:
    normalized_table_code = normalize_table_code(payload.table_code)
    service_mode = payload.service_mode or ServiceMode.RESTAURANTE.value
    table = db.scalar(
        select(Table).where(Table.store_id == payload.store_id, Table.code == normalized_table_code, Table.active == True)
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found or inactive")

    table_session = db.scalar(
        select(TableSession)
        .where(
            TableSession.store_id == payload.store_id,
            TableSession.table_id == table.id,
            TableSession.status.in_(ACTIVE_TABLE_SESSION_STATUSES),
        )
        .order_by(TableSession.id.desc())
        .limit(1)
    )
    if not table_session:
        table_session = TableSession(
            store_id=payload.store_id,
            table_id=table.id,
            guest_count=payload.guest_count,
            status=TableSessionStatus.MESA_OCUPADA.value,
            service_mode=service_mode,
            checkout_status=RESTAURANT_CHECKOUT_NONE,
        )
        db.add(table_session)
        db.flush()
    else:
        active_order = _active_order_for_session(
            db, table_session_id=table_session.id, store_id=payload.store_id
        )
        table_session.guest_count = payload.guest_count
        table_session.service_mode = service_mode
        table_session.checkout_status = RESTAURANT_CHECKOUT_NONE
        table_session.status = TableSessionStatus.CON_PEDIDO.value if active_order else TableSessionStatus.MESA_OCUPADA.value
        db.add(table_session)
    active_order = _active_order_for_session(db, table_session_id=table_session.id, store_id=payload.store_id)
    db.commit()
    event_bus.publish(
        "table.session.opened",
        {
            "table_session_id": table_session.id,
            "store_id": payload.store_id,
            "table_code": table.code,
            "guest_count": table_session.guest_count,
            "status": table_session.status,
            "service_mode": table_session.service_mode,
            "active_order_id": active_order.id if active_order else None,
        },
    )

    return OpenTableSessionResponse(
        table_session_id=table_session.id,
        store_id=payload.store_id,
        table_code=table.code,
        guest_count=table_session.guest_count,
        status=table_session.status,
        service_mode=table_session.service_mode,
        checkout_status=table_session.checkout_status or RESTAURANT_CHECKOUT_NONE,
        active_order_id=active_order.id if active_order else None,
    )


@router.post("/table/session/{table_session_id}/join", response_model=JoinTableSessionResponse)
def join_table_session(
    table_session_id: int,
    payload: JoinTableSessionRequest,
    db: Session = Depends(get_db),
) -> JoinTableSessionResponse:
    session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if session.status not in ACTIVE_TABLE_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="Table session is closed")

    client = db.scalar(
        select(TableSessionClient).where(
            TableSessionClient.table_session_id == table_session_id,
            TableSessionClient.client_id == payload.client_id,
        )
    )
    if not client:
        client = TableSessionClient(
            table_session_id=table_session_id,
            client_id=payload.client_id,
            alias=payload.alias,
            joined_at=datetime.utcnow(),
            last_seen_at=datetime.utcnow(),
        )
        db.add(client)
    else:
        client.alias = payload.alias or client.alias
        client.last_seen_at = datetime.utcnow()
        db.add(client)

    db.flush()
    connected_clients = db.scalar(
        select(func.count()).select_from(TableSessionClient).where(TableSessionClient.table_session_id == table_session_id)
    ) or 0
    db.commit()
    event_bus.publish(
        "table.session.joined",
        {
            "table_session_id": table_session_id,
            "store_id": session.store_id,
            "client_id": payload.client_id,
            "connected_clients": int(connected_clients),
        },
    )
    return JoinTableSessionResponse(
        table_session_id=table_session_id,
        client_id=payload.client_id,
        alias=client.alias,
        connected_clients=int(connected_clients),
        table_session_token=create_table_session_token(
            table_session_id=table_session_id,
            store_id=session.store_id,
            client_id=payload.client_id,
        ),
    )


@router.get("/table/session/{table_session_id}/state", response_model=TableSessionStateResponse)
def get_table_session_state(
    table_session_id: int,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> TableSessionStateResponse:
    if table_client.table_session_id != table_session_id:
        raise HTTPException(status_code=403, detail="Table session token does not match this session")
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != table_client.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    active_order = _active_order_for_session(
        db, table_session_id=table_session.id, store_id=table_session.store_id
    )
    connected_clients = db.scalar(
        select(func.count()).select_from(TableSessionClient).where(TableSessionClient.table_session_id == table_session_id)
    ) or 0
    latest_assistance_request = None
    if table_client.client_id:
        latest_assistance_request = db.scalar(
            select(TableSessionCashRequest)
            .where(
                TableSessionCashRequest.table_session_id == table_session_id,
                TableSessionCashRequest.client_id == table_client.client_id,
                TableSessionCashRequest.request_kind.in_(
                    [
                        CashRequestKind.WAITER_CALL.value,
                        CashRequestKind.CASH_PAYMENT.value,
                        CashRequestKind.TRANSFER_PAYMENT.value,
                        CashRequestKind.POSNET_PAYMENT.value,
                    ]
                ),
            )
            .order_by(TableSessionCashRequest.created_at.desc(), TableSessionCashRequest.id.desc())
            .limit(1)
        )

    assistance_message = None
    assistance_kind = None
    assistance_status = None
    assistance_note = None
    if latest_assistance_request:
        assistance_kind = latest_assistance_request.request_kind
        assistance_status = latest_assistance_request.status
        assistance_note = latest_assistance_request.note
        if latest_assistance_request.status == CashRequestStatus.RESOLVED.value:
            if latest_assistance_request.request_kind == CashRequestKind.CASH_PAYMENT.value:
                assistance_message = "El staff ya registro tu pago en efectivo."
            elif latest_assistance_request.request_kind == CashRequestKind.TRANSFER_PAYMENT.value:
                store = db.scalar(select(Store).where(Store.id == table_session.store_id))
                transfer_text = (store.payment_transfer_instructions or "").strip() if store else ""
                assistance_message = (
                    transfer_text
                    or "El staff habilito la transferencia. Usa los datos indicados por el local y despues avisanos."
                )
            elif latest_assistance_request.request_kind == CashRequestKind.POSNET_PAYMENT.value:
                note = (latest_assistance_request.note or "").strip()
                assistance_message = (
                    f"Ahi va un mozo con el posnet para cobrar por {note}."
                    if note
                    else "Ahi va un mozo con el posnet para cobrarte."
                )
            elif latest_assistance_request.request_kind == CashRequestKind.WAITER_CALL.value:
                assistance_message = "El mozo se esta acercando."
        elif latest_assistance_request.status == CashRequestStatus.PENDING.value:
            if latest_assistance_request.request_kind == CashRequestKind.CASH_PAYMENT.value:
                assistance_message = "Ya avisamos al staff para cobrar en efectivo."
            elif latest_assistance_request.request_kind == CashRequestKind.TRANSFER_PAYMENT.value:
                assistance_message = "Esperando que el staff habilite la transferencia."
            elif latest_assistance_request.request_kind == CashRequestKind.POSNET_PAYMENT.value:
                assistance_message = "Esperando que el staff habilite ese medio de pago."

    return TableSessionStateResponse(
        table_session_id=table_session.id,
        store_id=table_session.store_id,
        table_code=table.code if table else "-",
        guest_count=table_session.guest_count,
        status=table_session.status,
        service_mode=table_session.service_mode,
        checkout_status=table_session.checkout_status or RESTAURANT_CHECKOUT_NONE,
        connected_clients=int(connected_clients),
        active_order_id=active_order.id if active_order else None,
        assistance_request_kind=assistance_kind,
        assistance_request_status=assistance_status,
        assistance_request_note=assistance_note,
        assistance_message=assistance_message,
    )


@router.get("/table/session/{table_session_id}/consumption", response_model=TableSessionConsumptionResponse)
def get_table_session_consumption(
    table_session_id: int,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> TableSessionConsumptionResponse:
    if table_client.table_session_id != table_session_id:
        raise HTTPException(status_code=403, detail="Table session token does not match this session")
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != table_client.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")

    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    orders = (
        db.scalars(
            select(Order)
            .where(
                Order.table_session_id == table_session_id,
                Order.review_status != OrderReviewStatus.REJECTED.value,
            )
            .options()
            .order_by(Order.created_at.asc(), Order.id.asc())
        )
        .all()
    )
    order_ids = [int(order.id) for order in orders]
    items = []
    if order_ids:
        items = (
            db.scalars(
                select(OrderItem)
                .where(OrderItem.order_id.in_(order_ids))
                .order_by(OrderItem.created_at.asc(), OrderItem.id.asc())
            ).all()
        )

    products_by_id = {
        product.id: product.name
        for product in db.scalars(
            select(Product).where(Product.id.in_({item.product_id for item in items} if items else {0}))
        ).all()
    }

    return TableSessionConsumptionResponse(
        table_session_id=table_session.id,
        table_code=table.code if table else "-",
        guest_count=table_session.guest_count,
        order_ids=order_ids,
        items=[
            TableSessionConsumptionItemOut(
                item_id=item.id,
                order_id=item.order_id,
                product_name=products_by_id.get(item.product_id, f"Item {item.id}"),
                qty=item.qty,
                unit_price=float(item.unit_price),
                created_by_client_id=item.created_by_client_id,
                created_at=item.created_at,
                updated_at=item.updated_at,
                notes=item.notes,
                sector=item.sector,
                status=item.status,
            )
            for item in items
        ],
    )


@router.post("/table/session/{table_session_id}/request-checkout", response_model=RestaurantCheckoutResponse)
def request_restaurant_checkout(
    table_session_id: int,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> RestaurantCheckoutResponse:
    if table_client.table_session_id != table_session_id:
        raise HTTPException(status_code=403, detail="Table session token does not match this session")
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != table_client.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    if table_session.service_mode != ServiceMode.RESTAURANTE.value:
        raise HTTPException(status_code=409, detail="Este paso solo aplica a restaurante.")
    if table_session.status not in ACTIVE_TABLE_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="La mesa ya esta cerrada.")

    active_order = _active_order_for_session(db, table_session_id=table_session.id, store_id=table_session.store_id)
    if not active_order or active_order.review_status != OrderReviewStatus.APPROVED.value:
        raise HTTPException(status_code=409, detail="Todavia no hay una cuenta lista para cerrar.")

    table_session.checkout_status = RESTAURANT_CHECKOUT_REQUESTED
    db.add(table_session)
    db.commit()
    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    event_bus.publish(
        "table.session.checkout_requested",
        {
            "table_session_id": table_session.id,
            "store_id": table_session.store_id,
            "table_code": table.code if table else "-",
            "checkout_status": table_session.checkout_status,
        },
    )
    return RestaurantCheckoutResponse(
        table_session_id=table_session.id,
        table_code=table.code if table else "-",
        checkout_status=table_session.checkout_status,
    )


@router.post("/table/session/{table_session_id}/feedback", response_model=TableSessionFeedbackResponse)
def submit_table_session_feedback(
    table_session_id: int,
    payload: TableSessionFeedbackRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> TableSessionFeedbackResponse:
    if table_client.table_session_id != table_session_id or table_client.client_id != payload.client_id:
        raise HTTPException(status_code=403, detail="Feedback token does not match this session")
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.store_id != table_client.store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    if table_session.status != TableSessionStatus.CLOSED.value:
        raise HTTPException(status_code=409, detail="Table session must be closed before sending feedback")

    feedback = db.scalar(
        select(TableSessionFeedback).where(
            TableSessionFeedback.table_session_id == table_session_id,
            TableSessionFeedback.client_id == payload.client_id,
        )
    )
    if feedback:
        raise HTTPException(status_code=409, detail="Feedback already submitted for this session")

    feedback = TableSessionFeedback(
        table_session_id=table_session_id,
        store_id=table_session.store_id,
        client_id=payload.client_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(feedback)

    db.commit()
    db.refresh(feedback)
    return TableSessionFeedbackResponse(
        table_session_id=feedback.table_session_id,
        client_id=feedback.client_id,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
    )


@router.post("/orders/upsert-by-table", response_model=CreateOrderResponse, status_code=201)
def upsert_order_by_table(
    payload: UpsertOrderByTableRequest,
    table_client: TableClientContext = Depends(get_current_table_client),
    db: Session = Depends(get_db),
) -> CreateOrderResponse:
    if not payload.items:
        raise HTTPException(status_code=422, detail="At least one item is required")

    table_session = db.scalar(select(TableSession).where(TableSession.id == payload.table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.status not in ACTIVE_TABLE_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="Table session is closed")
    if table_session.store_id != payload.store_id:
        raise HTTPException(status_code=403, detail="Store mismatch in table session")
    if payload.client_id:
        if table_client.table_session_id != payload.table_session_id or table_client.client_id != payload.client_id:
            raise HTTPException(status_code=403, detail="Table session token does not match this client")
        if table_client.store_id != payload.store_id:
            raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
        joined_client = db.scalar(
            select(TableSessionClient).where(
                TableSessionClient.table_session_id == payload.table_session_id,
                TableSessionClient.client_id == payload.client_id,
            )
        )
        if not joined_client:
            raise HTTPException(status_code=409, detail="Client must join table session before ordering")

    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    if not table or not table.active:
        raise HTTPException(status_code=404, detail="Table not found or inactive")

    order = _active_order_for_session(
        db, table_session_id=table_session.id, store_id=payload.store_id
    )
    service_mode = payload.service_mode or ServiceMode.RESTAURANTE.value
    review_status, payment_gate = _order_flow_defaults(service_mode)
    payment_status = OrderPaymentStatus.PENDING.value
    created_new = False
    if _should_create_new_session_order(order, service_mode):
        order = None
    if not order:
        created_new = True
        ticket_number = next_ticket_number(db, payload.store_id)
        order = Order(
            tenant_id=payload.tenant_id,
            store_id=payload.store_id,
            table_id=table.id,
            table_session_id=table_session.id,
            guest_count=payload.guest_count,
            ticket_number=ticket_number,
            status_aggregated=OrderStatus.RECEIVED.value,
            review_status=review_status,
            service_mode=service_mode,
            payment_gate=payment_gate,
            payment_status=payment_status,
        )
        db.add(order)
        db.flush()
    else:
        if order.table_session_id != table_session.id:
            raise HTTPException(status_code=409, detail="Active order belongs to a different table session")
        order.guest_count = max(order.guest_count, payload.guest_count)
        if order.service_mode != service_mode:
            raise HTTPException(status_code=409, detail="Active order has a different service mode")
        if order.review_status != OrderReviewStatus.PENDING.value:
            raise HTTPException(status_code=409, detail="Active order is no longer editable")
        order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(order)
        db.flush()

    sectors_present = add_items_to_order(
        db, store_id=payload.store_id, order=order, items=payload.items, client_id=payload.client_id
    )
    table_session.guest_count = max(int(table_session.guest_count or 1), int(payload.guest_count))
    table_session.status = TableSessionStatus.CON_PEDIDO.value
    db.add(table_session)
    order.status_aggregated = recompute_order_status_from_items(db, order.id)
    order.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(order)
    previous_split = get_latest_bill_split(db, order.id)
    previous_split_id = previous_split.id if previous_split else None
    previous_split_status = previous_split.status if previous_split else None
    split_synced = sync_open_split_to_order_total(db, order)
    db.commit()

    if created_new:
        event_bus.publish(
            "order.created",
            {
                "order_id": order.id,
                "table_session_id": table_session.id,
                "store_id": payload.store_id,
                "table_code": table.code,
                "status_aggregated": order.status_aggregated,
            },
        )

    event_bus.publish(
        "items.changed",
        {
            "order_id": order.id,
            "table_session_id": table_session.id,
            "store_id": payload.store_id,
            "table_code": table.code,
            "item_sector": None,
            "item_status": OrderStatus.RECEIVED.value,
            "status_aggregated": order.status_aggregated,
            "reason": "items_appended",
        },
    )
    event_bus.publish(
        "table.session.updated",
        {
            "table_session_id": table_session.id,
            "store_id": payload.store_id,
            "table_code": table.code,
            "guest_count": table_session.guest_count,
            "status": table_session.status,
            "active_order_id": order.id,
        },
    )
    if split_synced:
        reason = (
            "split_reopened_after_new_items"
            if previous_split_status == "CLOSED" and previous_split_id != split_synced.id
            else "order_total_updated"
        )
        event_bus.publish(
            "bill.split.updated",
            {
                "order_id": order.id,
                "table_session_id": table_session.id,
                "store_id": payload.store_id,
                "bill_split_id": split_synced.id,
                "status": split_synced.status,
                "reason": reason,
            },
        )

    return CreateOrderResponse(
        order_id=order.id,
        ticket_number=order.ticket_number,
        status_aggregated=order.status_aggregated,
        review_status=order.review_status,
        service_mode=order.service_mode,
        payment_gate=order.payment_gate,
        payment_status=order.payment_status,
        sectors=[SectorStatusOut(sector=s, status=OrderStatus.RECEIVED.value) for s in sorted(sectors_present)],
    )
