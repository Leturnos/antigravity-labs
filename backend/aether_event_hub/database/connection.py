import os
import aiosqlite
from contextlib import asynccontextmanager

_db_path = os.path.join(os.path.dirname(__file__), "..", "aether_tasks.db")

def set_db_path(path: str):
    global _db_path
    _db_path = path

@asynccontextmanager
async def get_db(db_path: str | None = None):
    path = db_path or _db_path
    db = await aiosqlite.connect(path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode = WAL;")
    await db.execute("PRAGMA busy_timeout = 5000;")
    await db.execute("PRAGMA synchronous = NORMAL;")
    try:
        yield db
    finally:
        await db.close()

async def init_db(db_path: str | None = None):
    async with get_db(db_path) as db:
        await db.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 5,
            scheduled_at TIMESTAMP,
            cron_expression TEXT,
            interval_seconds INTEGER,
            timeout_sec INTEGER NOT NULL DEFAULT 60,
            max_retries INTEGER NOT NULL DEFAULT 3,
            retry_count INTEGER NOT NULL DEFAULT 0,
            exponential_backoff_sec INTEGER NOT NULL DEFAULT 5,
            max_backoff_sec INTEGER NOT NULL DEFAULT 3600,
            result TEXT,
            error_log TEXT,
            execution_time_ms REAL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL
        );
        """)
        await db.commit()
