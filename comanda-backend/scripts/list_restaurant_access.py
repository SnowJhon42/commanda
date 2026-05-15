import argparse
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy.exc import OperationalError
from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.models import StaffAccount, Store, Table, Tenant
from app.db.session import SessionLocal

STAFF_BASE_URL = "https://comanda-staff.vercel.app"
CLIENT_BASE_URL = "https://comanda-cliente.vercel.app"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="List restaurants/stores with access info and public links.")
    parser.add_argument("--store-id", type=int, help="Filter a single store.")
    parser.add_argument("--tenant", help="Filter by tenant name substring.")
    return parser.parse_args()


def build_rows(store_id: int | None = None, tenant_filter: str | None = None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    tenant_filter_normalized = (tenant_filter or "").strip().lower()

    with SessionLocal() as db:
        stores = db.scalars(select(Store).order_by(Store.id.asc())).all()
        if store_id is not None:
            stores = [store for store in stores if store.id == store_id]

        tenant_ids = {store.tenant_id for store in stores}
        tenants = {
            tenant.id: tenant
            for tenant in db.scalars(select(Tenant).where(Tenant.id.in_(tenant_ids)).order_by(Tenant.id.asc())).all()
        }
        tables = db.scalars(select(Table).order_by(Table.store_id.asc(), Table.code.asc())).all()
        staff_accounts = db.scalars(select(StaffAccount).order_by(StaffAccount.store_id.asc(), StaffAccount.username.asc())).all()

    tables_by_store: dict[int, list[str]] = defaultdict(list)
    for table in tables:
        tables_by_store[table.store_id].append(table.code)

    staff_by_store: dict[int, list[StaffAccount]] = defaultdict(list)
    for staff in staff_accounts:
        staff_by_store[staff.store_id].append(staff)

    for store in stores:
        tenant = tenants.get(store.tenant_id)
        tenant_name = tenant.name if tenant else f"tenant_{store.tenant_id}"
        if tenant_filter_normalized and tenant_filter_normalized not in tenant_name.lower():
            continue

        active_staff = [staff for staff in staff_by_store.get(store.id, []) if bool(staff.active)]
        admins = [staff.username for staff in active_staff if staff.sector == "ADMIN"]
        staff_users = [f"{staff.username}[{staff.sector}]" for staff in active_staff]
        table_codes = tables_by_store.get(store.id, [])

        rows.append(
            {
                "tenant_id": str(store.tenant_id),
                "tenant": tenant_name,
                "store_id": str(store.id),
                "store": store.name,
                "owner_password": "SET" if (store.owner_password_hash or "").strip() else "MISSING",
                "tables": str(len(table_codes)),
                "table_list": ", ".join(table_codes) if table_codes else "-",
                "admins": ", ".join(admins) if admins else "-",
                "staff": ", ".join(staff_users) if staff_users else "-",
                "staff_link": f"{STAFF_BASE_URL}/?store_id={store.id}",
                "client_link": f"{CLIENT_BASE_URL}/?store_id={store.id}&mesa=M1",
                "client_bar_link": f"{CLIENT_BASE_URL}/?store_id={store.id}&mesa=M1&service_mode=BAR",
            }
        )

    return rows


def format_table(rows: list[dict[str, str]], columns: list[str]) -> str:
    if not rows:
        return "No stores found."

    widths = {
        column: max(len(column), max(len(str(row.get(column, ""))) for row in rows))
        for column in columns
    }
    header = " | ".join(column.ljust(widths[column]) for column in columns)
    divider = "-+-".join("-" * widths[column] for column in columns)
    body = [
        " | ".join(str(row.get(column, "")).ljust(widths[column]) for column in columns)
        for row in rows
    ]
    return "\n".join([header, divider, *body])


if __name__ == "__main__":
    args = parse_args()
    try:
        table_rows = build_rows(store_id=args.store_id, tenant_filter=args.tenant)
        print(
            format_table(
                table_rows,
                [
                    "tenant_id",
                    "tenant",
                    "store_id",
                    "store",
                    "owner_password",
                    "tables",
                    "admins",
                    "staff",
                    "staff_link",
                    "client_link",
                ],
            )
        )
    except OperationalError as exc:
        raise SystemExit(
            "No se pudo leer la base actual. Confirmá DATABASE_URL y que el esquema esté inicializado."
        ) from exc
