from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import json
from backend.aether_event_hub.database.connection import get_db

router = APIRouter(prefix="/api", tags=["Tasks & Metrics"])

class TaskCreateSchema(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "send_email"})
    payload: Dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(5, ge=1, le=10)
    scheduled_at: Optional[str] = None  # ISO 8601 string
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    timeout_sec: int = Field(60, gt=0)
    max_retries: int = Field(3, ge=0)
    exponential_backoff_sec: int = Field(5, gt=0)
    max_backoff_sec: int = Field(3600, gt=0)

@router.post("/tasks", status_code=201)
async def create_task(request: Request, task_in: TaskCreateSchema):
    engine = request.app.state.engine
    sched_dt = None
    if task_in.scheduled_at:
        try:
            sched_dt = datetime.fromisoformat(task_in.scheduled_at)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ISO 8601 date format for scheduled_at")

    task_id = await engine.enqueue_task(
        name=task_in.name,
        payload=task_in.payload,
        priority=task_in.priority,
        scheduled_at=sched_dt,
        cron_expression=task_in.cron_expression,
        interval_seconds=task_in.interval_seconds,
        timeout_sec=task_in.timeout_sec,
        max_retries=task_in.max_retries,
        exponential_backoff_sec=task_in.exponential_backoff_sec,
        max_backoff_sec=task_in.max_backoff_sec
    )
    return {"id": task_id, "status": "PENDING", "message": "Task enqueued successfully"}

@router.get("/tasks")
async def list_tasks(
    request: Request,
    status: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0)
):
    db_path = request.app.state.engine.db_path
    async with get_db(db_path) as db:
        if status:
            cursor = await db.execute(
                "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (status.upper(), limit, offset)
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            )
        rows = await cursor.fetchall()
        
        # Total count query
        if status:
            count_cur = await db.execute("SELECT COUNT(*) FROM tasks WHERE status = ?", (status.upper(),))
        else:
            count_cur = await db.execute("SELECT COUNT(*) FROM tasks")
        total = (await count_cur.fetchone())[0]

        items = []
        for row in rows:
            item = dict(row)
            try:
                item["payload"] = json.loads(item["payload"])
            except Exception:
                pass
            if item.get("result"):
                try:
                    item["result"] = json.loads(item["result"])
                except Exception:
                    pass
            items.append(item)
            
        return {"total": total, "limit": limit, "offset": offset, "tasks": items}

@router.get("/tasks/{task_id}")
async def get_task(request: Request, task_id: str):
    db_path = request.app.state.engine.db_path
    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        item = dict(row)
        try:
            item["payload"] = json.loads(item["payload"])
        except Exception:
            pass
        if item.get("result"):
            try:
                item["result"] = json.loads(item["result"])
            except Exception:
                pass
        return item

@router.post("/tasks/{task_id}/retry")
async def retry_task(request: Request, task_id: str):
    db_path = request.app.state.engine.db_path
    now_str = datetime.now(timezone.utc).isoformat()
    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
            
        await db.execute("""
            UPDATE tasks
            SET status = 'PENDING', scheduled_at = ?, retry_count = 0, error_log = NULL, updated_at = ?
            WHERE id = ?
        """, (now_str, now_str, task_id))
        await db.commit()
        
    event_hub = getattr(request.app.state, "event_hub", None)
    if event_hub:
        await event_hub.broadcast("task_status_changed", {"id": task_id, "status": "PENDING"})
        
    return {"message": "Task reset to PENDING for retry", "id": task_id}

@router.post("/tasks/{task_id}/cancel")
async def cancel_task(request: Request, task_id: str):
    db_path = request.app.state.engine.db_path
    now_str = datetime.now(timezone.utc).isoformat()
    async with get_db(db_path) as db:
        cursor = await db.execute("SELECT status FROM tasks WHERE id = ?", (task_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        if row["status"] not in ("PENDING", "RETRYING"):
            raise HTTPException(status_code=400, detail=f"Cannot cancel task in state '{row['status']}'")
            
        await db.execute("UPDATE tasks SET status = 'CANCELLED', updated_at = ? WHERE id = ?", (now_str, task_id))
        await db.commit()
        
    event_hub = getattr(request.app.state, "event_hub", None)
    if event_hub:
        await event_hub.broadcast("task_status_changed", {"id": task_id, "status": "CANCELLED"})
        
    return {"message": "Task cancelled successfully", "id": task_id}

@router.get("/metrics")
async def get_metrics(request: Request):
    engine = request.app.state.engine
    db_path = engine.db_path
    async with get_db(db_path) as db:
        cursor = await db.execute("""
            SELECT status, COUNT(*) as count, AVG(execution_time_ms) as avg_duration
            FROM tasks
            GROUP BY status
        """)
        rows = await cursor.fetchall()
        
    counts = {"PENDING": 0, "RUNNING": 0, "COMPLETED": 0, "FAILED": 0, "RETRYING": 0, "CANCELLED": 0, "DLQ": 0}
    avg_durations = []
    for row in rows:
        st = row["status"]
        if st in counts:
            counts[st] = row["count"]
        if row["avg_duration"]:
            avg_durations.append(row["avg_duration"])
            
    avg_latency = (sum(avg_durations) / len(avg_durations)) if avg_durations else 0.0

    return {
        "active_workers": len(engine.running_tasks),
        "max_concurrent_workers": engine.max_concurrent_tasks,
        "counts": counts,
        "avg_latency_ms": round(avg_latency, 2)
    }
