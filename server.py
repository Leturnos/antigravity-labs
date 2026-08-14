"""Entrypoint and central FastAPI server for the unified Aether Suite."""

import os
from backend.aether_event_hub.main import app
from tools.aether_collab_board.backend.router import router as collab_board_router
from backend.aether_api_workbench.main import app as workbench_app

# Register sub-project routers directly into the central server app
app.include_router(collab_board_router)
app.include_router(workbench_app.router)

# Ensure catch-all static mount is evaluated last so API routes take priority
static_routes = [r for r in app.routes if getattr(r, "name", "") == "root_static"]
for sr in static_routes:
    app.routes.remove(sr)
    app.routes.append(sr)

PORT = int(os.getenv("PORT", 8000))

if __name__ == '__main__':
    try:
        import uvicorn
    except ImportError:
        import subprocess
        import sys
        try:
            print("Iniciando o servidor unificado via uv run...")
            subprocess.run(["uv", "run", "python", "server.py"])
            sys.exit(0)
        except Exception:
            pass

    try:
        import uvicorn
        print(f"Central Aether Suite Server running at: http://localhost:{PORT}")
        uvicorn.run("server:app", host="0.0.0.0", port=PORT)
    except Exception:
        import http.server
        import socketserver

        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", PORT), http.server.SimpleHTTPRequestHandler) as httpd:
            print(f"Central Aether Suite Server (static only) running at: http://localhost:{PORT}")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nServidor finalizado.")
