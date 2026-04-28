import sqlite3
import sys
from pathlib import Path

from sqlalchemy import create_engine

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MONOREPO_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.core.security import hash_pin
from app.db.runtime_schema import apply_sqlite_schema_bootstrap


def database_file_from_url(url: str) -> Path:
    if not url.startswith("sqlite:///"):
        raise RuntimeError("init_db.py currently supports only sqlite:/// URLs")
    return Path(url.replace("sqlite:///", "", 1)).resolve()


def run_sql_script(conn: sqlite3.Connection, script_path: Path) -> None:
    script = script_path.read_text(encoding="utf-8")
    conn.executescript(script)


if __name__ == "__main__":
    docs_dir = MONOREPO_ROOT / "docs"
    db_file = database_file_from_url(settings.database_url)
    db_file.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(str(db_file)) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        run_sql_script(conn, docs_dir / "DB_SCHEMA_SQLITE.sql")
        run_sql_script(conn, docs_dir / "DB_SEED_MIN.sql")
        hashed_pin = hash_pin("1234")
        conn.execute(
            """
            UPDATE staff_accounts
            SET pin_hash = ?
            WHERE pin_hash LIKE 'CHANGE_ME_HASH_%'
            """,
            (hashed_pin,),
        )
        conn.execute(
            """
            UPDATE staff_accounts
            SET display_name = COALESCE(NULLIF(TRIM(display_name), ''), username)
            WHERE display_name IS NULL OR TRIM(display_name) = ''
            """
        )
        conn.execute(
            """
            UPDATE stores
            SET owner_password_hash = ?
            WHERE owner_password_hash IS NULL
            """,
            (hashed_pin,),
        )

    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    with engine.begin() as conn:
        apply_sqlite_schema_bootstrap(conn)

    print(f"Database initialized at {db_file}")
