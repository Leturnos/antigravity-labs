import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
from croniter import croniter
from backend.aether_event_hub.database.connection import get_db
from backend.aether_event_hub.core.executors.base import BaseTaskExecutor, TaskResult

class TaskQueueEngine:
    def __init__(self, db_path: str, executor: BaseTaskExecutor, max_concurrent_tasks: int = 5):
        self.db_path = db_path
        self.executor = executor
        self.max_concurrent_tasks = max_concurrent_tasks
        self.running_tasks: set[str] = set()
        self._running_loop = False
        self._loop_task: Optional[asyncio.Task] = None
        self._event_hub = None

    def set_event_hub(self, event_hub):
        self._event_hub = event_hub

    async def enqueue_task(
        self,
        name: str,
        payload: Dict[str, Any],
        priority: int = 5,
        scheduled_at: Optional[datetime] = None,
        cron_expression: Optional[str] = None,
        interval_seconds: Optional[int] = None,
        timeout_sec: int = 60,
        max_retries: int = 3,
        exponential_backoff_sec: int = 5,
        max_backoff_sec: int = 3600
    ) -> str:
        task_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        now_str = now.isoformat()
        sched_str = scheduled_at.isoformat() if scheduled_at else now_str

        async with get_db(self.db_path) as db:
            await db.execute("""
                INSERT INTO tasks (
                    id, name, payload, status, priority, scheduled_at,
                    cron_expression, interval_seconds, timeout_sec, max_retries, retry_count,
                    exponential_backoff_sec, max_backoff_sec, created_at, updated_at
                ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
            """, (
                task_id, name, json.dumps(payload), priority, sched_str,
                cron_expression, interval_seconds, timeout_sec, max_retries,
                exponential_backoff_sec, max_backoff_sec, now_str, now_str
            ))
            await db.commit()

        if self._event_hub:
            await self._event_hub.broadcast("task_created", {"id": task_id, "name": name, "status": "PENDING"})

        return task_id

    async def recover_orphaned_tasks(self):
        now_str = datetime.now(timezone.utc).isoformat()
        async with get_db(self.db_path) as db:
            await db.execute("""
                UPDATE tasks
                SET status = 'RETRYING', scheduled_at = ?, updated_at = ?
                WHERE status = 'RUNNING' AND retry_count < max_retries
            """, (now_str, now_str))
            
            await db.execute("""
                UPDATE tasks
                SET status = 'DLQ', error_log = 'Orphaned task recovered after system restart', updated_at = ?
                WHERE status = 'RUNNING' AND retry_count >= max_retries
            """, (now_str,))
            await db.commit()

    async def claim_tasks(self) -> list[dict]:
        available_slots = self.max_concurrent_tasks - len(self.running_tasks)
        if available_slots <= 0:
            return []

        now_str = datetime.now(timezone.utc).isoformat()
        async with get_db(self.db_path) as db:
            cursor = await db.execute("""
                UPDATE tasks
                SET status = 'RUNNING', updated_at = ?
                WHERE id IN (
                    SELECT id FROM tasks
                    WHERE status IN ('PENDING', 'RETRYING')
                      AND (scheduled_at IS NULL OR scheduled_at <= ?)
                    ORDER BY priority DESC, created_at ASC
                    LIMIT ?
                )
                RETURNING id, name, payload, timeout_sec, max_retries, retry_count,
                          exponential_backoff_sec, max_backoff_sec, cron_expression, interval_seconds;
            """, (now_str, now_str, available_slots))
            rows = await cursor.fetchall()
            await db.commit()
            return [dict(row) for row in rows]

    def compute_next_run(self, task_data: dict, current_time: datetime) -> Optional[datetime]:
        cron_expr = task_data.get("cron_expression")
        interval_sec = task_data.get("interval_seconds")
        
        if cron_expr:
            try:
                iter_cron = croniter(cron_expr, current_time)
                return iter_cron.get_next(datetime)
            except Exception:
                pass
        if interval_sec:
            return current_time + timedelta(seconds=interval_sec)
        return None

    async def _execute_task_wrapper(self, task_data: dict):
        task_id = task_data["id"]
        self.running_tasks.add(task_id)
        
        if self._event_hub:
            await self._event_hub.broadcast("task_status_changed", {"id": task_id, "status": "RUNNING"})
            
        try:
            payload = json.loads(task_data["payload"])
            timeout = task_data["timeout_sec"]
            
            try:
                res = await asyncio.wait_for(self.executor.execute(task_data["name"], payload), timeout=timeout)
            except asyncio.TimeoutError:
                res = TaskResult(success=False, error_message=f"Task execution timed out after {timeout}s")

            await self._finalize_task_execution(task_data, res)
        finally:
            self.running_tasks.remove(task_id)

    async def _finalize_task_execution(self, task_data: dict, result: TaskResult):
        task_id = task_data["id"]
        now = datetime.now(timezone.utc)
        now_str = now.isoformat()
        
        next_run_dt = self.compute_next_run(task_data, now)
        is_recurring = next_run_dt is not None
        next_sched_str = next_run_dt.isoformat() if next_run_dt else None
        
        final_status = "COMPLETED"

        async with get_db(self.db_path) as db:
            if result.success:
                if is_recurring and next_sched_str:
                    final_status = "PENDING"
                    await db.execute("""
                        UPDATE tasks SET status = 'PENDING', scheduled_at = ?, retry_count = 0,
                                         result = ?, execution_time_ms = ?, updated_at = ?
                        WHERE id = ?
                    """, (next_sched_str, json.dumps(result.result_data), result.execution_time_ms, now_str, task_id))
                else:
                    final_status = "COMPLETED"
                    await db.execute("""
                        UPDATE tasks SET status = 'COMPLETED', result = ?, execution_time_ms = ?, updated_at = ?
                        WHERE id = ?
                    """, (json.dumps(result.result_data), result.execution_time_ms, now_str, task_id))
            else:
                retry_count = task_data["retry_count"] + 1
                max_retries = task_data["max_retries"]
                
                if retry_count < max_retries:
                    final_status = "RETRYING"
                    raw_delay = task_data["exponential_backoff_sec"] * (2 ** retry_count)
                    delay = min(raw_delay, task_data["max_backoff_sec"])
                    retry_sched = (now + timedelta(seconds=delay)).isoformat()
                    await db.execute("""
                        UPDATE tasks SET status = 'RETRYING', retry_count = ?, scheduled_at = ?,
                                         error_log = ?, execution_time_ms = ?, updated_at = ?
                        WHERE id = ?
                    """, (retry_count, retry_sched, result.error_message, result.execution_time_ms, now_str, task_id))
                else:
                    if is_recurring and next_sched_str:
                        final_status = "PENDING"
                        await db.execute("""
                            UPDATE tasks SET status = 'PENDING', scheduled_at = ?, retry_count = 0,
                                             error_log = ?, execution_time_ms = ?, updated_at = ?
                            WHERE id = ?
                        """, (next_sched_str, f"DLQ Audit: {result.error_message}", result.execution_time_ms, now_str, task_id))
                    else:
                        final_status = "DLQ"
                        await db.execute("""
                            UPDATE tasks SET status = 'DLQ', error_log = ?, execution_time_ms = ?, updated_at = ?
                            WHERE id = ?
                        """, (result.error_message, result.execution_time_ms, now_str, task_id))
            await db.commit()

        if self._event_hub:
            await self._event_hub.broadcast("task_status_changed", {"id": task_id, "status": final_status})

    async def process_single_cycle(self):
        claimed = await self.claim_tasks()
        for task_data in claimed:
            asyncio.create_task(self._execute_task_wrapper(task_data))

    async def _poller_loop(self):
        while self._running_loop:
            try:
                await self.process_single_cycle()
            except Exception:
                pass
            await asyncio.sleep(0.5)

    def start(self):
        if not self._running_loop:
            self._running_loop = True
            self._loop_task = asyncio.create_task(self._poller_loop())

    def stop(self):
        self._running_loop = False
        if self._loop_task:
            self._loop_task.cancel()
