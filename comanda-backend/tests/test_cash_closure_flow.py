import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.deps import TableClientContext
from app.api.staff import (
    bootstrap_shift,
    close_cash_session,
    close_shift,
    close_table_session,
    collect_order_payment,
    get_active_shift,
    open_cash_session,
    open_shift,
    patch_item_status,
)
from app.api.table_sessions import join_table_session, open_table_session, upsert_order_by_table
from app.db.models import BillPartPaymentStatus, BillSplit, BillSplitPart, BillSplitStatus, OrderItem
from app.schemas.orders import (
    BootstrapShiftRequest,
    ChangeItemStatusRequest,
    CloseCashSessionRequest,
    CollectOrderPaymentRequest,
    JoinTableSessionRequest,
    OpenCashSessionRequest,
    OpenShiftRequest,
    OpenTableSessionRequest,
    UpsertOrderByTableRequest,
)

from conftest import seed_minimum_store_data


def _seed_open_order(db):
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
    open_shift(OpenShiftRequest(label="Turno test", operator_name="admin"), store_id=store.id, db=db, current_staff=admin)
    return store, table, admin, created


def test_close_table_session_blocks_when_order_has_pending_balance(session_factory):
    with session_factory() as db:
        store, table, admin, _created = _seed_open_order(db)
        open_cash_session(OpenCashSessionRequest(opening_float=0), store_id=store.id, db=db, current_staff=admin)

        with pytest.raises(HTTPException) as exc:
            close_table_session(table.code, db=db, current_staff=admin)

        assert "saldo pendiente" in str(exc.value.detail)


def test_close_shift_requires_closed_cash_but_allows_open_tables_for_next_turn(session_factory):
    with session_factory() as db:
        store, _table, admin, _created = _seed_open_order(db)
        open_cash_session(OpenCashSessionRequest(opening_float=0), store_id=store.id, db=db, current_staff=admin)

        with pytest.raises(HTTPException) as shift_open_exc:
            close_shift(store_id=store.id, db=db, current_staff=admin)
        assert "Cerrá la caja" in str(shift_open_exc.value.detail)

        close_cash_session(
            CloseCashSessionRequest(declared_amount=0, note="ok"),
            store_id=store.id,
            db=db,
            current_staff=admin,
        )
        closed = close_shift(store_id=store.id, db=db, current_staff=admin)
        assert closed.closed_shift.status == "CLOSED"
        assert closed.summary.pending_orders_count == 1

        next_shift = open_shift(
            OpenShiftRequest(label="Turno siguiente", operator_name="admin-2"),
            store_id=store.id,
            db=db,
            current_staff=admin,
        )
        assert next_shift.active_shift is not None
        assert next_shift.summary.pending_orders_count == 1


def test_bootstrap_shift_opens_shift_and_cash_in_one_step(session_factory):
    with session_factory() as db:
        _tenant, store, _table, _product, admin = seed_minimum_store_data(db)
        opened = bootstrap_shift(
            BootstrapShiftRequest(
                label="Turno manana",
                operator_name="agustin",
                opening_float=5000,
                note="inicio",
            ),
            store_id=store.id,
            db=db,
            current_staff=admin,
        )
        assert opened.active_shift is not None
        assert opened.active_shift.label == "Turno manana"
        assert opened.summary.cash_session is not None
        assert opened.summary.cash_session.status == "OPEN"
        assert opened.summary.cash_session.opening_float == 5000


def test_get_active_shift_and_close_cash_recover_from_orphan_open_cash(session_factory):
    with session_factory() as db:
        _tenant, store, _table, _product, admin = seed_minimum_store_data(db)
        opened = bootstrap_shift(
            BootstrapShiftRequest(
                label="Turno huerfano",
                operator_name="admin",
                opening_float=5000,
                note="inicio",
            ),
            store_id=store.id,
            db=db,
            current_staff=admin,
        )

        closed = close_shift(store_id=store.id, db=db, current_staff=admin)
        assert closed.closed_shift.status == "CLOSED"
        assert closed.summary.cash_session is not None
        assert closed.summary.cash_session.status == "OPEN"

        active = get_active_shift(store_id=store.id, db=db, current_staff=admin)
        assert active.active_shift is not None
        assert active.active_shift.id == opened.active_shift.id
        assert active.active_shift.status == "CLOSED"
        assert active.summary.cash_session is not None
        assert active.summary.cash_session.status == "OPEN"

        cash_closed = close_cash_session(
            CloseCashSessionRequest(declared_amount=5000, note="cierre recuperado"),
            store_id=store.id,
            db=db,
            current_staff=admin,
        )
        assert cash_closed.cash_session.status == "CLOSED"


def test_patch_item_status_requires_active_shift(session_factory):
    with session_factory() as db:
        tenant, store, table, product, admin = seed_minimum_store_data(db)
        opened = open_table_session(
            OpenTableSessionRequest(store_id=store.id, table_code=table.code, guest_count=1),
            db=db,
        )
        join_table_session(
            opened.table_session_id,
            JoinTableSessionRequest(client_id="client-no-shift", alias="Sin turno"),
            db=db,
        )
        table_client = TableClientContext(
            table_session_id=opened.table_session_id,
            store_id=store.id,
            client_id="client-no-shift",
        )
        created = upsert_order_by_table(
            UpsertOrderByTableRequest(
                tenant_id=tenant.id,
                store_id=store.id,
                table_session_id=opened.table_session_id,
                client_id="client-no-shift",
                guest_count=1,
                items=[{"product_id": product.id, "qty": 1}],
            ),
            table_client=table_client,
            db=db,
        )
        item_id = db.scalar(select(OrderItem.id).where(OrderItem.order_id == created.order_id))

        with pytest.raises(HTTPException) as exc:
            patch_item_status(
                item_id,
                ChangeItemStatusRequest(to_status="IN_PROGRESS"),
                db=db,
                current_staff=admin,
            )

        assert "No hay turno abierto" in str(exc.value.detail)


def test_collecting_full_bar_prepay_confirms_payment_and_unlocks_progress(session_factory):
    with session_factory() as db:
        tenant, store, table, product, admin = seed_minimum_store_data(db)
        opened = open_table_session(
            OpenTableSessionRequest(store_id=store.id, table_code=table.code, guest_count=1),
            db=db,
        )
        join_table_session(
            opened.table_session_id,
            JoinTableSessionRequest(client_id="client-bar", alias="Bar"),
            db=db,
        )
        table_client = TableClientContext(
            table_session_id=opened.table_session_id,
            store_id=store.id,
            client_id="client-bar",
        )
        created = upsert_order_by_table(
            UpsertOrderByTableRequest(
                tenant_id=tenant.id,
                store_id=store.id,
                table_session_id=opened.table_session_id,
                client_id="client-bar",
                guest_count=1,
                service_mode="BAR",
                items=[{"product_id": product.id, "qty": 1}],
            ),
            table_client=table_client,
            db=db,
        )
        open_shift(OpenShiftRequest(label="Turno bar", operator_name="admin"), store_id=store.id, db=db, current_staff=admin)
        open_cash_session(OpenCashSessionRequest(opening_float=0), store_id=store.id, db=db, current_staff=admin)

        item_id = db.scalar(select(OrderItem.id).where(OrderItem.order_id == created.order_id))
        with pytest.raises(HTTPException) as blocked_exc:
            patch_item_status(
                item_id,
                ChangeItemStatusRequest(to_status="IN_PROGRESS"),
                db=db,
                current_staff=admin,
            )
        assert "payment must be confirmed" in str(blocked_exc.value.detail)

        payment = collect_order_payment(
            created.order_id,
            CollectOrderPaymentRequest(payment_method="CARD", amount=1000),
            db=db,
            current_staff=admin,
        )
        assert payment.payment_confirmed is True
        assert payment.balance_due == 0

        changed = patch_item_status(
            item_id,
            ChangeItemStatusRequest(to_status="IN_PROGRESS"),
            db=db,
            current_staff=admin,
        )
        assert changed.current_status == "IN_PROGRESS"


def test_order_paid_amount_sums_split_and_cash_payments_without_double_counting(session_factory):
    with session_factory() as db:
        store, _table, admin, created = _seed_open_order(db)
        open_cash_session(OpenCashSessionRequest(opening_float=0), store_id=store.id, db=db, current_staff=admin)

        split = BillSplit(
            order_id=created.order_id,
            status=BillSplitStatus.OPEN.value,
            total_amount=1000,
            mode="EQUAL",
        )
        db.add(split)
        db.flush()
        db.add(
            BillSplitPart(
                bill_split_id=split.id,
                label="Parte A",
                amount=400,
                payment_status=BillPartPaymentStatus.CONFIRMED.value,
            )
        )
        db.commit()

        payment = collect_order_payment(
            created.order_id,
            CollectOrderPaymentRequest(payment_method="CASH", amount=600),
            db=db,
            current_staff=admin,
        )
        assert payment.payment_confirmed is True
        assert payment.total_paid == 1000
        assert payment.balance_due == 0
