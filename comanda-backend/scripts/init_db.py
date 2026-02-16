import sqlite3
from pathlib import Path

from app.core.config import settings


def database_file_from_url(url: str) -> Path:
    if not url.startswith("sqlite:///"):
        raise RuntimeError("init_db.py currently supports only sqlite:/// URLs")
    return Path(url.replace("sqlite:///", "", 1))


def run_sql_script(conn: sqlite3.Connection, script_path: Path) -> None:
    script = script_path.read_text(encoding="utf-8")
    conn.executescript(script)


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parents[2]
    docs_dir = repo_root / "docs"
    db_file = database_file_from_url(settings.database_url)
    db_file.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_file) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        run_sql_script(conn, docs_dir / "DB_SCHEMA_SQLITE.sql")
        run_sql_script(conn, docs_dir / "DB_SEED_MIN.sql")

    print(f"Database initialized at {db_file}")
