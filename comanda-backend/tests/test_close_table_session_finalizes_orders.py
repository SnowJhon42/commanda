from sqlalchemy import select

from app.api.deps import TableClientContext
from app.api.staff import close_table_session
from app.api.table_sessions import join_table_session, open_table_session, upsert_order_by_table
from app.db.models import Order, OrderItem, OrderStatus, TableSession, TableSessionStatus
from app.schemas.orders import JoinTableSessionRequest, OpenTableSessionRequest, UpsertOrderByTableRequest

from conftest import seed_minimum_store_data


def test_close_table_session_finalizes_session_orders_and_items(session_factory):
    with session_factory() as db:
        tenant, store, table, product, admin = seed_minimum_store_data(db)

        opened = open_table_session(
            OpenTableSessionRequest(store_id=store.id, table_code=table.code, guest_count=2),
            db=db,
        )
        join_table_session(
            opened.table_session_id,
            JoinTableSessionRequest(client_id="client-a", alias="A"),
            db=db,
        )
        table_client = TableClientContext(
            table_session_id=opened.table_session_id,
            store_id=store.id,
            client_id="client-a",
        )

        created = upsert_order_by_table(
            UpsertOrderByTableRequest(
                tenant_id=tenant.id,
                store_id=store.id,
                table_session_id=opened.table_session_id,
                client_id="client-a",
                guest_count=2,
                items=[{"product_id": product.id, "qty": 1}],
            ),
            table_client=table_client,
            db=db,
        )

        closed = close_table_session(table.code, db=db, current_staff=admin)
        assert closed.table_session_id == opened.table_session_id
        assert closed.status == TableSessionStatus.CLOSED.value

        order = db.get(Order, created.order_id)
        assert order is not None
        assert order.status_aggregated == OrderStatus.DELIVERED.value

        items = db.scalars(select(OrderItem).where(OrderItem.order_id == created.order_id)).all()
        assert items
        assert all(item.status == OrderStatus.DELIVERED.value for item in items)

        session = db.get(TableSession, opened.table_session_id)
        assert session is not None
        assert session.status == TableSessionStatus.CLOSED.value
