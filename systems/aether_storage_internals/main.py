"""Main FastAPI application for Aether Storage Internals."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .api.router import get_engine, router as storage_router
from .api.ws import ws_manager

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager initializing engine and WebSocket loop."""
    loop = asyncio.get_running_loop()
    ws_manager.set_event_loop(loop)
    # Eagerly initialize engine
    engine = get_engine()
    yield
    # Graceful shutdown
    engine.close()


app = FastAPI(
    title="Aether Storage Internals",
    description="Mini LSM-Tree Key-Value Storage Engine & Telemetry Inspector",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API router
app.include_router(storage_router)


# WebSocket endpoint for real-time telemetry streaming
@app.websocket("/ws/storage")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep socket alive and receive client messages (e.g. ping)
            data = await websocket.receive_text()
    except (WebSocketDisconnect, asyncio.CancelledError):
        ws_manager.disconnect(websocket)


# Health check
@app.get("/api/storage/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": "Aether Storage Internals", "version": "1.0.0"}


# Static files mount
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


@app.get("/", include_in_schema=False)
def root_redirect():
    return RedirectResponse(url="/static/index.html")
