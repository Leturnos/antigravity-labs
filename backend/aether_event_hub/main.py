import asyncio
import os
import random
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.aether_event_hub.database.connection import init_db, set_db_path
from backend.aether_event_hub.core.executors.asyncio_executor import AsyncioTaskExecutor
from backend.aether_event_hub.core.engine import TaskQueueEngine
from backend.aether_event_hub.core.event_hub import EventHub
from backend.aether_event_hub.api.routes_tasks import router as tasks_router, get_metrics
from backend.aether_event_hub.api.websockets import router as ws_router
from games.routes_scores import router as scores_router

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "aether_tasks.db")
DB_FILE = os.getenv("AETHER_DB_PATH", DEFAULT_DB_PATH)

# Setup Executor Handlers
executor = AsyncioTaskExecutor()

async def send_email_handler(payload):
    await asyncio.sleep(random.uniform(0.2, 0.8))
    recipient = payload.get("to", "user@example.com")
    subject = payload.get("subject", "Aether Notification")
    return {"status": "sent", "to": recipient, "subject": subject, "timestamp": time.time()}

async def process_image_handler(payload):
    await asyncio.sleep(random.uniform(0.5, 1.2))
    filename = payload.get("filename", "image.png")
    width = payload.get("width", 1920)
    height = payload.get("height", 1080)
    return {"processed": True, "file": filename, "resolution": f"{width}x{height}"}

async def cpu_intensive_handler(payload):
    # Simulate non-blocking CPU workload computation
    iterations = payload.get("iterations", 50000)
    def compute():
        res = 0
        for i in range(iterations):
            res += i * i
        return res
    total = await asyncio.to_thread(compute)
    return {"iterations": iterations, "total": total}

async def fail_demo_handler(payload):
    await asyncio.sleep(0.3)
    msg = payload.get("error", "Simulated task processing error")
    raise RuntimeError(msg)

async def timeout_demo_handler(payload):
    delay = payload.get("delay", 10.0)
    await asyncio.sleep(delay)
    return {"completed_after": delay}

executor.register_handler("send_email", send_email_handler)
executor.register_handler("process_image", process_image_handler)
executor.register_handler("cpu_intensive", cpu_intensive_handler)
executor.register_handler("fail_demo", fail_demo_handler)
executor.register_handler("timeout_demo", timeout_demo_handler)

event_hub = EventHub()
engine = TaskQueueEngine(db_path=DB_FILE, executor=executor, max_concurrent_tasks=5)
engine.set_event_hub(event_hub)

async def metrics_broadcaster(app: FastAPI):
    while True:
        try:
            if event_hub.active_connections:
                # Reuse metrics logic
                counts = {"PENDING": 0, "RUNNING": 0, "COMPLETED": 0, "FAILED": 0, "RETRYING": 0, "CANCELLED": 0, "DLQ": 0}
                metrics_data = {
                    "active_workers": len(engine.running_tasks),
                    "max_concurrent_workers": engine.max_concurrent_tasks,
                    "counts": counts
                }
                await event_hub.broadcast("metrics_tick", metrics_data)
        except Exception:
            pass
        await asyncio.sleep(1.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    set_db_path(DB_FILE)
    await init_db(DB_FILE)
    await engine.recover_orphaned_tasks()
    engine.start()
    
    app.state.engine = engine
    app.state.event_hub = event_hub
    
    broadcaster_task = asyncio.create_task(metrics_broadcaster(app))
    
    yield
    
    broadcaster_task.cancel()
    engine.stop()

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

app = FastAPI(
    title="Aether Event Hub & Task Queue",
    description="Lightweight background task scheduling & event hub with SQLite WAL & WebSockets",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks_router)
app.include_router(ws_router)
app.include_router(scores_router)

# Catch-all: serve the entire repo root as static files (replicates
# the old SimpleHTTPRequestHandler behavior). html=True auto-serves
# index.html for directory requests. API/WS routes above take priority.
app.mount("/", StaticFiles(directory=ROOT_DIR, html=True), name="root_static")
