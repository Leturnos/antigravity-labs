import pytest
import asyncio
from datetime import datetime, timezone
from backend.aether_event_hub.database.connection import init_db, get_db
from backend.aether_event_hub.core.executors.asyncio_executor import AsyncioTaskExecutor
from backend.aether_event_hub.core.engine import TaskQueueEngine

@pytest.mark.asyncio
async def test_engine_atomic_claim_and_execution(tmp_path):
    db_file = str(tmp_path / "engine_test.db")
    await init_db(db_file)
    
    executor = AsyncioTaskExecutor()
    async def quick_task(payload):
        return {"status": "ok"}
    executor.register_handler("quick", quick_task)
    
    engine = TaskQueueEngine(db_path=db_file, executor=executor, max_concurrent_tasks=2)
    task_id = await engine.enqueue_task("quick", {"foo": "bar"})
    
    await engine.process_single_cycle()
    await asyncio.sleep(0.1)  # Allow background execution wrapper to complete
    
    async with get_db(db_file) as db:
        async with db.execute("SELECT status, result FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            assert row["status"] == "COMPLETED"
            assert "ok" in row["result"]

@pytest.mark.asyncio
async def test_engine_timeout_enforcement(tmp_path):
    db_file = str(tmp_path / "timeout_test.db")
    await init_db(db_file)
    
    executor = AsyncioTaskExecutor()
    async def slow_task(payload):
        await asyncio.sleep(2.0)
        return {"done": True}
    executor.register_handler("slow", slow_task)
    
    engine = TaskQueueEngine(db_path=db_file, executor=executor, max_concurrent_tasks=2)
    task_id = await engine.enqueue_task("slow", {}, timeout_sec=1, max_retries=1)
    
    await engine.process_single_cycle()
    await asyncio.sleep(1.2)
    
    async with get_db(db_file) as db:
        async with db.execute("SELECT status, error_log FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            assert row["status"] in ("RETRYING", "DLQ")
            assert "timed out" in row["error_log"].lower()

@pytest.mark.asyncio
async def test_engine_orphan_recovery(tmp_path):
    db_file = str(tmp_path / "orphan_test.db")
    await init_db(db_file)
    
    async with get_db(db_file) as db:
        now_str = datetime.now(timezone.utc).isoformat()
        await db.execute("""
            INSERT INTO tasks (id, name, payload, status, created_at, updated_at, max_retries, retry_count)
            VALUES ('orphan-1', 'test', '{}', 'RUNNING', ?, ?, 3, 0)
        """, (now_str, now_str))
        await db.commit()

    executor = AsyncioTaskExecutor()
    engine = TaskQueueEngine(db_path=db_file, executor=executor)
    await engine.recover_orphaned_tasks()

    async with get_db(db_file) as db:
        async with db.execute("SELECT status FROM tasks WHERE id = 'orphan-1'") as cursor:
            row = await cursor.fetchone()
            assert row["status"] == "RETRYING"

@pytest.mark.asyncio
async def test_recurring_interval_task_rescheduling(tmp_path):
    db_file = str(tmp_path / "recurring_test.db")
    await init_db(db_file)
    
    executor = AsyncioTaskExecutor()
    async def periodic_task(payload):
        return {"tick": 1}
    executor.register_handler("periodic", periodic_task)
    
    engine = TaskQueueEngine(db_path=db_file, executor=executor)
    task_id = await engine.enqueue_task("periodic", {}, interval_seconds=10)
    
    await engine.process_single_cycle()
    await asyncio.sleep(0.1)
    
    async with get_db(db_file) as db:
        async with db.execute("SELECT status, scheduled_at FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            assert row["status"] == "PENDING"
            assert row["scheduled_at"] is not None
