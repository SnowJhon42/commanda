from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Order,
    OrderItem,
    OrderStatus,
    Product,
    ProductVariant,
    Table,
    TableSession,
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
    TableSessionFeedbackRequest,
    TableSessionFeedbackResponse,
    UpsertOrderByTableRequest,
)
from app.services.item_status import recompute_order_status_from_items
from app.services.order_routing import route_item_to_sector
from app.services.realtime import event_bus
from app.services.table_code import normalize_table_code
from app.services.ticket_generator import next_ticket_number

router = APIRouter(tags=["table-session"])


def _active_order_for_table(db: Session, *, store_id: int, table_id: int) -> Order | None:
    return db.scalar(
        select(Order)
        .where(Order.store_id == store_id, Order.table_id == table_id, Order.status_aggregated != OrderStatus.DELIVERED.value)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(1)
    )


def _add_items_to_order(db: Session, *, store_id: int, order: Order, items: list) -> set[str]:
    sectors_present = {row[0] for row in db.execute(select(OrderItem.sector).where(OrderItem.order_id == order.id)).all()}

    for raw_item in items:
        product = db.scalar(
            select(Product).where(Product.id == raw_item.product_id, Product.store_id == store_id, Product.active == True)
        )
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {raw_item.product_id} not found")

        variant_price = 0.0
        if raw_item.variant_id:
            variant = db.scalar(
                select(ProductVariant).where(
                    ProductVariant.id == raw_item.variant_id,
                    ProductVariant.product_id == product.id,
                    ProductVariant.active == True,
                )
            )
            if not variant:
                raise HTTPException(status_code=404, detail=f"Variant {raw_item.variant_id} not found")
            variant_price = float(variant.extra_price)

        sector = route_item_to_sector(product)
        sectors_present.add(sector)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                variant_id=raw_item.variant_id,
                qty=raw_item.qty,
                unit_price=float(product.base_price) + variant_price,
                notes=raw_item.notes,
                sector=sector,
                status=OrderStatus.RECEIVED.value,
            )
        )
    db.flush()
    return sectors_present


@router.post("/table/session/open", response_model=OpenTableSessionResponse)
def open_table_session(payload: OpenTableSessionRequest, db: Session = Depends(get_db)) -> OpenTableSessionResponse:
    normalized_table_code = normalize_table_code(payload.table_code)
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
            TableSession.status == TableSessionStatus.OPEN.value,
        )
        .order_by(TableSession.id.desc())
        .limit(1)
    )
    if not table_session:
        table_session = TableSession(
            store_id=payload.store_id,
            table_id=table.id,
            status=TableSessionStatus.OPEN.value,
        )
        db.add(table_session)
        db.flush()

    active_order = _active_order_for_table(db, store_id=payload.store_id, table_id=table.id)
    db.commit()

    return OpenTableSessionResponse(
        table_session_id=table_session.id,
        store_id=payload.store_id,
        table_code=table.code,
        status=table_session.status,
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
    if session.status != TableSessionStatus.OPEN.value:
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
    )


@router.get("/table/session/{table_session_id}/state", response_model=TableSessionStateResponse)
def get_table_session_state(table_session_id: int, db: Session = Depends(get_db)) -> TableSessionStateResponse:
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")

    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    active_order = _active_order_for_table(db, store_id=table_session.store_id, table_id=table_session.table_id)
    connected_clients = db.scalar(
        select(func.count()).select_from(TableSessionClient).where(TableSessionClient.table_session_id == table_session_id)
    ) or 0
    return TableSessionStateResponse(
        table_session_id=table_session.id,
        store_id=table_session.store_id,
        table_code=table.code if table else "-",
        status=table_session.status,
        connected_clients=int(connected_clients),
        active_order_id=active_order.id if active_order else None,
    )


@router.post("/table/session/{table_session_id}/feedback", response_model=TableSessionFeedbackResponse)
def submit_table_session_feedback(
    table_session_id: int,
    payload: TableSessionFeedbackRequest,
    db: Session = Depends(get_db),
) -> TableSessionFeedbackResponse:
    table_session = db.scalar(select(TableSession).where(TableSession.id == table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.status != TableSessionStatus.CLOSED.value:
        raise HTTPException(status_code=409, detail="Table session must be closed before sending feedback")

    feedback = db.scalar(
        select(TableSessionFeedback).where(
            TableSessionFeedback.table_session_id == table_session_id,
            TableSessionFeedback.client_id == payload.client_id,
        )
    )
    if not feedback:
        feedback = TableSessionFeedback(
            table_session_id=table_session_id,
            store_id=table_session.store_id,
            client_id=payload.client_id,
            rating=payload.rating,
            comment=payload.comment,
        )
        db.add(feedback)
    else:
        feedback.rating = payload.rating
        feedback.comment = payload.comment
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
def upsert_order_by_table(payload: UpsertOrderByTableRequest, db: Session = Depends(get_db)) -> CreateOrderResponse:
    if not payload.items:
        raise HTTPException(status_code=422, detail="At least one item is required")

    table_session = db.scalar(select(TableSession).where(TableSession.id == payload.table_session_id))
    if not table_session:
        raise HTTPException(status_code=404, detail="Table session not found")
    if table_session.status != TableSessionStatus.OPEN.value:
        raise HTTPException(status_code=409, detail="Table session is closed")
    if table_session.store_id != payload.store_id:
        raise HTTPException(status_code=403, detail="Store mismatch in table session")

    table = db.scalar(select(Table).where(Table.id == table_session.table_id))
    if not table or not table.active:
        raise HTTPException(status_code=404, detail="Table not found or inactive")

    order = _active_order_for_table(db, store_id=payload.store_id, table_id=table.id)
    created_new = False
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
        )
        db.add(order)
        db.flush()
    else:
        order.guest_count = max(order.guest_count, payload.guest_count)
        if not order.table_session_id:
            order.table_session_id = table_session.id
        db.add(order)
        db.flush()

    sectors_present = _add_items_to_order(db, store_id=payload.store_id, order=order, items=payload.items)
    order.status_aggregated = recompute_order_status_from_items(db, order.id)
    db.add(order)
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

    return CreateOrderResponse(
        order_id=order.id,
        ticket_number=order.ticket_number,
        status_aggregated=order.status_aggregated,
        sectors=[SectorStatusOut(sector=s, status=OrderStatus.RECEIVED.value) for s in sorted(sectors_present)],
    )
