# app/db.py
from __future__ import annotations

import os
import time
from typing import Generator, Iterable

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from .models import Base

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL env")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def _wait_db_ready(wait_s: int) -> None:
    t0 = time.time()
    last_err: Exception | None = None
    while time.time() - t0 < wait_s:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception as e:
            last_err = e
            time.sleep(1)
    raise RuntimeError(f"DB not ready within {wait_s}s: {last_err}")


def _column_exists(table: str, column: str) -> bool:
    sql = text(
        """
        SELECT COUNT(*) AS c
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :t
          AND column_name = :c
        """
    )
    with engine.connect() as conn:
        n = conn.execute(sql, {"t": table, "c": column}).scalar_one()
    return int(n) > 0


def _add_column_if_missing(table: str, column: str, ddl: str) -> None:
    if _column_exists(table, column):
        return
    with engine.begin() as conn:
        conn.execute(text(ddl))


def _exec_many(stmts: Iterable[str]) -> None:
    with engine.begin() as conn:
        for s in stmts:
            conn.execute(text(s))


def ensure_tables() -> None:
    """
    1) DB readiness wait
    2) create_all (new installs)
    3) minimal "safe" migrations for older volumes
       - only ADD COLUMN when missing
       - keep columns nullable to avoid breaking legacy rows
    """
    wait_s = int(os.environ.get("DB_WAIT_S", "60"))
    _wait_db_ready(wait_s)

    # New installs: create tables that don't exist.
    Base.metadata.create_all(bind=engine)

    # Legacy installs: jobs table may exist with fewer columns.
    # Keep DDL MariaDB/MySQL compatible.
    job_cols: list[tuple[str, str]] = [
        ("title", "ALTER TABLE jobs ADD COLUMN title VARCHAR(255) NULL"),
        ("pipeline_type", "ALTER TABLE jobs ADD COLUMN pipeline_type VARCHAR(64) NULL"),
        ("preset_id", "ALTER TABLE jobs ADD COLUMN preset_id VARCHAR(64) NULL"),
        ("status", "ALTER TABLE jobs ADD COLUMN status VARCHAR(32) NULL"),
        ("progress", "ALTER TABLE jobs ADD COLUMN progress DOUBLE NULL"),
        ("message", "ALTER TABLE jobs ADD COLUMN message VARCHAR(255) NULL"),
        ("error", "ALTER TABLE jobs ADD COLUMN error TEXT NULL"),
        ("input_filename", "ALTER TABLE jobs ADD COLUMN input_filename VARCHAR(255) NULL"),
        ("input_content_type", "ALTER TABLE jobs ADD COLUMN input_content_type VARCHAR(255) NULL"),
        ("input_saved_path", "ALTER TABLE jobs ADD COLUMN input_saved_path VARCHAR(1024) NULL"),
        ("input_bytes", "ALTER TABLE jobs ADD COLUMN input_bytes INT NULL"),
        ("created_at", "ALTER TABLE jobs ADD COLUMN created_at DATETIME NULL"),
        ("updated_at", "ALTER TABLE jobs ADD COLUMN updated_at DATETIME NULL"),
    ]
    for col, ddl in job_cols:
        _add_column_if_missing("jobs", col, ddl)

    # Backfill null timestamps for legacy rows (best-effort)
    _exec_many([
        "UPDATE jobs SET created_at = NOW() WHERE created_at IS NULL",
        "UPDATE jobs SET updated_at = NOW() WHERE updated_at IS NULL",
        "UPDATE jobs SET status = 'queued' WHERE status IS NULL",
        "UPDATE jobs SET progress = 0 WHERE progress IS NULL",
        "UPDATE jobs SET message = '' WHERE message IS NULL",
        "UPDATE jobs SET input_bytes = 0 WHERE input_bytes IS NULL",
    ])
    # Legacy installs: artifacts table may exist with fewer columns.
    artifact_cols: list[tuple[str, str]] = [
        ("kind", "ALTER TABLE artifacts ADD COLUMN kind VARCHAR(32) NULL"),
        ("label", "ALTER TABLE artifacts ADD COLUMN label VARCHAR(255) NULL"),
        ("url", "ALTER TABLE artifacts ADD COLUMN url VARCHAR(1024) NULL"),
    ]
    for col, ddl in artifact_cols:
        _add_column_if_missing("artifacts", col, ddl)

    # Legacy installs: job_events schema drift (older schema used ts/status/progress/message/detail_json).
    # Current code uses: level, code, payload, created_at.
    event_cols: list[tuple[str, str]] = [
        ("level", "ALTER TABLE job_events ADD COLUMN level VARCHAR(16) NULL"),
        ("code", "ALTER TABLE job_events ADD COLUMN code VARCHAR(64) NULL"),
        ("payload", "ALTER TABLE job_events ADD COLUMN payload JSON NULL"),
        ("created_at", "ALTER TABLE job_events ADD COLUMN created_at DATETIME(6) NULL"),
    ]
    for col, ddl in event_cols:
        _add_column_if_missing("job_events", col, ddl)

    # Best-effort backfill created_at from legacy ts if available, else NOW().
    try:
        if _column_exists("job_events", "created_at"):
            if _column_exists("job_events", "ts"):
                _exec_many(["UPDATE job_events SET created_at = ts WHERE created_at IS NULL"])
            else:
                _exec_many(["UPDATE job_events SET created_at = NOW(6) WHERE created_at IS NULL"])
    except Exception:
        # Do not block startup if backfill fails; schema should still be usable.
        pass


def get_db() -> Generator[Session, None, None]:
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
