import argparse
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.security import hash_pin
from app.db.models import StaffAccount, Store, Table, Tenant
from app.db.session import SessionLocal

DEFAULT_STAFF_BASE_URL = "https://comanda-staff.vercel.app"
DEFAULT_CLIENT_BASE_URL = "https://comanda-cliente.vercel.app"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recover or reset access for a store.")
    parser.add_argument("--store-id", required=True, type=int, help="Store ID to recover.")
    parser.add_argument("--owner-password", help="New owner password for the store.")
    parser.add_argument("--staff-pin", help="New PIN applied to all staff users in the store.")
    parser.add_argument("--ensure-admin-username", help="Ensure this ADMIN user exists in the store.")
    parser.add_argument("--ensure-admin-display-name", help="Display name for ensured admin user.")
    parser.add_argument("--ensure-admin-pin", help="PIN for ensured admin user. Defaults to --staff-pin.")
    parser.add_argument("--save-local", action="store_true", help="Save recovery summary under backups/store-access/")
    return parser.parse_args()


def ensure_admin_user(
    *,
    db,
    store_id: int,
    username: str,
    display_name: str,
    pin: str,
) -> StaffAccount:
    normalized_username = username.strip().lower()
    staff = db.scalar(
        select(StaffAccount).where(StaffAccount.store_id == store_id, StaffAccount.username == normalized_username)
    )
    if staff:
        staff.sector = "ADMIN"
        staff.display_name = display_name
        staff.pin_hash = hash_pin(pin)
        staff.active = True
        return staff

    staff = StaffAccount(
        store_id=store_id,
        sector="ADMIN",
        display_name=display_name,
        username=normalized_username,
        pin_hash=hash_pin(pin),
        active=True,
    )
    db.add(staff)
    return staff


def build_summary(
    *,
    tenant_name: str,
    store_id: int,
    store_name: str,
    owner_password: str | None,
    staff_pin: str | None,
    ensured_admin_username: str | None,
    ensured_admin_pin: str | None,
    table_codes: list[str],
    staff_users: list[StaffAccount],
) -> str:
    admins = [staff.username for staff in staff_users if staff.sector == "ADMIN" and bool(staff.active)]
    summary_lines = [
        "STORE_ACCESS_RESET_OK",
        f"tenant={tenant_name}",
        f"store_id={store_id}",
        f"store={store_name}",
        f"tables={len(table_codes)}",
        f"table_list={', '.join(table_codes) if table_codes else '-'}",
        f"owner_password={owner_password or 'UNCHANGED'}",
        f"staff_pin={staff_pin or 'UNCHANGED'}",
        f"admins={', '.join(admins) if admins else '-'}",
        f"ensured_admin={ensured_admin_username or '-'}",
        f"ensured_admin_pin={ensured_admin_pin or '-'}",
        f"staff_link={DEFAULT_STAFF_BASE_URL}/?store_id={store_id}",
        f"client_link={DEFAULT_CLIENT_BASE_URL}/?store_id={store_id}&mesa=M1",
    ]
    return "\n".join(summary_lines)


if __name__ == "__main__":
    args = parse_args()
    if not args.owner_password and not args.staff_pin and not args.ensure_admin_username:
        raise SystemExit("Provide at least one of: --owner-password, --staff-pin, --ensure-admin-username")

    ensure_admin_pin = (args.ensure_admin_pin or args.staff_pin or "").strip()
    if args.ensure_admin_username and not ensure_admin_pin:
        raise SystemExit("--ensure-admin-pin is required when --staff-pin is not provided.")

    try:
        with SessionLocal() as db:
            store = db.scalar(select(Store).where(Store.id == args.store_id))
            if not store:
                raise SystemExit(f"Store not found: {args.store_id}")

            store_id = store.id
            store_name = store.name
            tenant = db.scalar(select(Tenant).where(Tenant.id == store.tenant_id))
            tenant_name = tenant.name if tenant else f"tenant_{store.tenant_id}"

            if args.owner_password:
                store.owner_password_hash = hash_pin(args.owner_password.strip())

            staff_users = db.scalars(
                select(StaffAccount).where(StaffAccount.store_id == store_id).order_by(StaffAccount.username.asc())
            ).all()

            if args.staff_pin:
                next_hash = hash_pin(args.staff_pin.strip())
                for staff in staff_users:
                    staff.pin_hash = next_hash
                    staff.active = True

            ensured_admin_username = None
            if args.ensure_admin_username:
                ensured_admin_username = args.ensure_admin_username.strip().lower()
                ensured_admin_display_name = (
                    args.ensure_admin_display_name.strip()
                    if (args.ensure_admin_display_name or "").strip()
                    else ensured_admin_username.replace("_", " ").title()
                )
                ensured_admin = ensure_admin_user(
                    db=db,
                    store_id=store_id,
                    username=ensured_admin_username,
                    display_name=ensured_admin_display_name,
                    pin=ensure_admin_pin,
                )
                if all(existing.id != ensured_admin.id for existing in staff_users):
                    staff_users.append(ensured_admin)

            db.commit()

            table_codes = db.scalars(
                select(Table.code).where(Table.store_id == store_id, Table.active == True).order_by(Table.code.asc())
            ).all()
            staff_users = db.scalars(
                select(StaffAccount).where(StaffAccount.store_id == store_id).order_by(StaffAccount.username.asc())
            ).all()
    except OperationalError as exc:
        raise SystemExit(
            "No se pudo escribir en la base actual. Confirmá DATABASE_URL y que el esquema esté inicializado."
        ) from exc

    summary = build_summary(
        tenant_name=tenant_name,
        store_id=store_id,
        store_name=store_name,
        owner_password=args.owner_password.strip() if args.owner_password else None,
        staff_pin=args.staff_pin.strip() if args.staff_pin else None,
        ensured_admin_username=ensured_admin_username,
        ensured_admin_pin=ensure_admin_pin or None,
        table_codes=table_codes,
        staff_users=staff_users,
    )
    print(summary)

    if args.save_local:
        repo_root = BACKEND_ROOT.parent
        target_dir = repo_root / "backups" / "store-access"
        target_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target_file = target_dir / f"store_{args.store_id}_{timestamp}.txt"
        target_file.write_text(summary + "\n", encoding="utf-8")
        print(f"saved_file={target_file}")
