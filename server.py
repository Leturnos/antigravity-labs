"""Entrypoint and central FastAPI server for the unified Aether Suite."""

import os
import sys
import shutil

# Auto-switch to virtual environment or uv if dependencies are missing in the current python interpreter
def _ensure_venv():
    try:
        import fastapi
        import uvicorn
    except ImportError:
        venv_python = os.path.join(os.path.dirname(__file__), ".venv", "bin", "python")
        if os.path.exists(venv_python) and os.path.abspath(sys.executable) != os.path.abspath(venv_python):
            print(f"Iniciando servidor via ambiente virtual (.venv)...")
            os.execv(venv_python, [venv_python] + sys.argv)
        
        if shutil.which("uv"):
            print("Iniciando servidor via 'uv run'...")
            os.execvp("uv", ["uv", "run", "python"] + sys.argv)
            
        print("\n[ERRO] O pacote 'fastapi' não foi encontrado no ambiente Python atual.")
        print("Por favor, ative o ambiente virtual ou execute utilizando:")
        print("  source .venv/bin/activate && python server.py")
        print("  OU: uv run python server.py\n")

_ensure_venv()

# Import main FastAPI application (Event Hub + Scores + Root Static)
from backend.aether_event_hub.main import app

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

# Ensure catch-all static mount is evaluated last so API routes take priority
static_routes = [r for r in app.routes if getattr(r, "name", "") == "root_static"]
for sr in static_routes:
    app.routes.remove(sr)
    app.routes.append(sr)

PORT = int(os.getenv("PORT", 8000))

if __name__ == '__main__':
    import uvicorn
    print(f"Central Aether Suite Server running at: http://localhost:{PORT}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT)



