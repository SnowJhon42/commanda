from app.api.deps import TableClientContext
from app.api.table_sessions import (
    get_table_session_consumption,
    get_table_session_state,
    join_table_session,
    open_table_session,
    upsert_order_by_table,
)
from app.db.models import Order, OrderItem, OrderStatus, TableSession, TableSessionStatus
from app.schemas.orders import JoinTableSessionRequest, OpenTableSessionRequest, UpsertOrderByTableRequest

from conftest import seed_minimum_store_data


def test_new_session_does_not_reuse_order_from_closed_session_same_table(session_factory):
    with session_factory() as db:
        tenant, store, table, product, _admin = seed_minimum_store_data(db)
        old_session = TableSession(
            store_id=store.id,
            table_id=table.id,
            guest_count=2,
            status=TableSessionStatus.CLOSED.value,
        )
        db.add(old_session)
        db.flush()

        old_order = Order(
            tenant_id=tenant.id,
            store_id=store.id,
            table_id=table.id,
            table_session_id=old_session.id,
            guest_count=2,
            ticket_number=1,
            status_aggregated=OrderStatus.RECEIVED.value,
        )
        db.add(old_order)
        db.flush()
        db.add(
            OrderItem(
                order_id=old_order.id,
                product_id=product.id,
                qty=1,
                unit_price=1000,
                sector=product.fulfillment_sector,
                status=OrderStatus.RECEIVED.value,
            )
        )
        db.commit()

        opened = open_table_session(
            OpenTableSessionRequest(store_id=store.id, table_code=table.code, guest_count=2),
            db=db,
        )
        assert opened.active_order_id is None

        joined = join_table_session(
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
        assert joined.table_session_token
        assert created.order_id != old_order.id

        state = get_table_session_state(opened.table_session_id, table_client=table_client, db=db)
        assert state.active_order_id == created.order_id

        consumption = get_table_session_consumption(opened.table_session_id, table_client=table_client, db=db)
        assert consumption.order_ids == [created.order_id]
        assert all(item.order_id == created.order_id for item in consumption.items)


def test_same_session_reuses_its_own_active_order(session_factory):
    with session_factory() as db:
        tenant, store, table, product, _admin = seed_minimum_store_data(db)

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

        first = upsert_order_by_table(
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
        second = upsert_order_by_table(
            UpsertOrderByTableRequest(
                tenant_id=tenant.id,
                store_id=store.id,
                table_session_id=opened.table_session_id,
                client_id="client-a",
                guest_count=2,
                items=[{"product_id": product.id, "qty": 2}],
            ),
            table_client=table_client,
            db=db,
        )

        assert second.order_id == first.order_id

        consumption = get_table_session_consumption(opened.table_session_id, table_client=table_client, db=db)
        assert consumption.order_ids == [first.order_id]
        assert len(consumption.items) == 2
