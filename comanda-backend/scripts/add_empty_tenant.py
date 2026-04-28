import argparse
import sqlite3
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.core.security import hash_pin


def database_file_from_url(url: str) -> Path:
    if not url.startswith("sqlite:///"):
        raise RuntimeError("add_empty_tenant.py currently supports only sqlite:/// URLs")
    return Path(url.replace("sqlite:///", "", 1)).resolve()


def slugify_username_prefix(name: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else "_" for ch in name.strip())
    parts = [part for part in normalized.split("_") if part]
    return "_".join(parts) or "local"


def ensure_tenant(conn: sqlite3.Connection, name: str) -> int:
    row = conn.execute("SELECT id FROM tenants WHERE name = ?", (name,)).fetchone()
    if row:
        return int(row[0])
    cursor = conn.execute("INSERT INTO tenants (name) VALUES (?)", (name,))
    return int(cursor.lastrowid)


def ensure_store(conn: sqlite3.Connection, tenant_id: int, store_name: str, owner_password: str) -> int:
    owner_password_hash = hash_pin(owner_password)
    row = conn.execute(
        "SELECT id FROM stores WHERE tenant_id = ? AND name = ?",
        (tenant_id, store_name),
    ).fetchone()
    if row:
        store_id = int(row[0])
        conn.execute(
            "UPDATE stores SET owner_password_hash = COALESCE(owner_password_hash, ?) WHERE id = ?",
            (owner_password_hash, store_id),
        )
        return store_id
    cursor = conn.execute(
        """
        INSERT INTO stores (tenant_id, name, show_live_total_to_client, print_mode, whatsapp_share_template, owner_password_hash)
        VALUES (?, ?, 1, 'MANUAL', NULL, ?)
        """,
        (tenant_id, store_name, owner_password_hash),
    )
    return int(cursor.lastrowid)


def ensure_tables(conn: sqlite3.Connection, store_id: int, table_count: int) -> int:
    created = 0
    for table_number in range(1, table_count + 1):
        cursor = conn.execute(
            "INSERT OR IGNORE INTO tables (store_id, code, active) VALUES (?, ?, 1)",
            (store_id, f"M{table_number}"),
        )
        if cursor.rowcount:
            created += 1
    return created


def ensure_staff(conn: sqlite3.Connection, store_id: int, username_prefix: str, pin: str) -> int:
    created = 0
    staff_users = (
        ("ADMIN", f"dueno_{username_prefix}"),
        ("ADMIN", f"admin_{username_prefix}"),
        ("KITCHEN", f"cocina_{username_prefix}"),
        ("BAR", f"barra_{username_prefix}"),
        ("WAITER", f"mozo_{username_prefix}"),
    )
    pin_hash = hash_pin(pin)
    for sector, username in staff_users:
        display_name = username.replace("_", " ").title()
        row = conn.execute(
            "SELECT id FROM staff_accounts WHERE store_id = ? AND username = ?",
            (store_id, username),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE staff_accounts SET sector = ?, display_name = ?, active = 1 WHERE id = ?",
                (sector, display_name, int(row[0])),
            )
            continue
        cursor = conn.execute(
            """
            INSERT INTO staff_accounts (store_id, sector, display_name, username, pin_hash, active)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            (store_id, sector, display_name, username, pin_hash),
        )
        if cursor.rowcount:
            created += 1
    return created


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an empty tenant/store ready for manual menu loading.")
    parser.add_argument("--tenant", required=True, help="Restaurant/business name.")
    parser.add_argument("--store", help="Initial store/sucursal name. Defaults to '<tenant> Centro'.")
    parser.add_argument("--tables", type=int, default=12, help="Number of M1..Mn tables to create.")
    parser.add_argument("--pin", default="1234", help="Initial PIN for all staff users.")
    parser.add_argument("--owner-password", default="1234", help="Initial owner password for Mi local.")
    parser.add_argument("--username-prefix", help="Username suffix, e.g. tata creates admin_tata.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.tables < 1:
        raise ValueError("--tables must be >= 1")

    tenant_name = args.tenant.strip()
    store_name = (args.store or f"{tenant_name} Centro").strip()
    username_prefix = args.username_prefix or slugify_username_prefix(tenant_name)

    db_file = database_file_from_url(settings.database_url)
    if not db_file.exists():
        raise FileNotFoundError(f"Database file not found: {db_file}. Run `python scripts/init_db.py` first.")

    with sqlite3.connect(str(db_file)) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        tenant_id = ensure_tenant(conn, tenant_name)
        store_id = ensure_store(conn, tenant_id, store_name, args.owner_password)
        tables_created = ensure_tables(conn, store_id, args.tables)
        staff_created = ensure_staff(conn, store_id, username_prefix, args.pin)
        conn.commit()

    print(f"tenant={tenant_name}")
    print(f"tenant_id={tenant_id}")
    print(f"store={store_name}")
    print(f"store_id={store_id}")
    print(f"tables_created={tables_created}")
    print(f"staff_created={staff_created}")
    print(f"staff_pin={args.pin}")
    print(f"owner_password={args.owner_password}")
    print(f"owner_user=dueno_{username_prefix}")
    print(f"admin_user=admin_{username_prefix}")
    print(f"kitchen_user=cocina_{username_prefix}")
    print(f"bar_user=barra_{username_prefix}")
    print(f"waiter_user=mozo_{username_prefix}")
