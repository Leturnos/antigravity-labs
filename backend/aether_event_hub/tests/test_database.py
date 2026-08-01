import pytest
import pytest_asyncio
import aiosqlite
from backend.aether_event_hub.database.connection import init_db, get_db

@pytest.mark.asyncio
async def test_init_db_creates_tables_and_pragmas(tmp_path):
    db_file = str(tmp_path / "test_queue.db")
    await init_db(db_file)
    
    async with get_db(db_file) as db:
        async with db.execute("PRAGMA journal_mode;") as cursor:
            row = await cursor.fetchone()
            assert row[0].lower() == "wal"
            
        async with db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks';") as cursor:
            row = await cursor.fetchone()
            assert row is not None
            assert row[0] == "tasks"
