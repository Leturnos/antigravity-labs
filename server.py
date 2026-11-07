"""Entrypoint and central FastAPI server for the unified Aether Suite."""

import os
import sys
import shutil

# Auto-switch to virtual environment or uv if dependencies are missing in the current python interpreter
def _ensure_venv():
    try:
        import fastapi
        import uvicorn
        return
    except ImportError:
        pass

    # Guard against infinite loop if child process also lacks required libraries
    if os.getenv("_AETHER_REEXEC"):
        print("\n[ERROR] 'fastapi' and 'uvicorn' are not installed in the current environment or via uv.")
        print("Install dependencies by running:")
        print("  uv venv && uv pip install -r backend/aether_event_hub/requirements.txt")
        print("  OR: uv add fastapi uvicorn\n")
        sys.exit(1)

    os.environ["_AETHER_REEXEC"] = "1"

    venv_python = os.path.join(os.path.dirname(__file__), ".venv", "bin", "python")
    if os.path.exists(venv_python) and os.path.abspath(sys.executable) != os.path.abspath(venv_python):
        print("Starting server via virtual environment (.venv)...")
        os.execv(venv_python, [venv_python] + sys.argv)

    if shutil.which("uv"):
        print("Starting server via 'uv run'...")
        os.execvp("uv", ["uv", "run", "python"] + sys.argv)

    print("\n[ERROR] The 'fastapi' package was not found in the current Python environment.")
    print("Please install dependencies or activate the virtual environment.\n")
    sys.exit(1)

_ensure_venv()

# Import main FastAPI application (Event Hub + Scores + Root Static)
try:
    from backend.aether_event_hub.main import app
except Exception as err:
    print(f"[Warning] Could not load Aether Event Hub backend: {err}")
    print("[Info] Starting in fallback mode (serving dashboard, games, and static tools)...")
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="Aether Suite (Fallback Static Mode)")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Mount root static directory
    app.mount("/", StaticFiles(directory=os.path.dirname(__file__), html=True), name="root_static")

# Register optional sub-project routers independently so one failure does not break the server
try:
    from tools.aether_collab_board.backend.router import router as collab_board_router
    app.include_router(collab_board_router)
except Exception as err:
    print(f"[Warning] Could not load Aether Collab Board router: {err}")

try:
    from backend.aether_api_workbench.main import app as workbench_app
    from backend.aether_api_workbench.database import init_db as init_workbench_db
    init_workbench_db()
    app.include_router(workbench_app.router)
except Exception as err:
    print(f"[Warning] Could not load Aether API Workbench router: {err}")

try:
    from systems.aether_storage_internals.api.router import router as storage_router
    from systems.aether_storage_internals.main import websocket_telemetry_endpoint
    app.include_router(storage_router)
    app.add_api_websocket_route("/ws/storage", websocket_telemetry_endpoint)
except Exception as err:
    print(f"[Warning] Could not load Aether Storage Internals router: {err}")

try:
    from systems.aether_quorum_db.api.router import quorum_ws_endpoint, router as quorum_router
    app.include_router(quorum_router)
    app.add_api_websocket_route("/ws/quorum", quorum_ws_endpoint)
except Exception as err:
    print(f"[Warning] Could not load Aether QuorumDB router: {err}")

# Ensure catch-all static mount is evaluated last so API routes take priority
static_routes = [r for r in app.routes if getattr(r, "name", "") == "root_static"]
for sr in static_routes:
    app.routes.remove(sr)
    app.routes.append(sr)

PORT = int(os.getenv("PORT", 8000))

if __name__ == '__main__':
    import uvicorn
    print(f"Central Aether Suite Server running at: http://localhost:{PORT}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=True)



