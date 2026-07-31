"""Entrypoint for the unified Aether Suite server.

Launches the FastAPI application via uvicorn. Falls back to a basic
static file server when the FastAPI stack is unavailable.
"""

import os

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
        uvicorn.run("backend.aether_event_hub.main:app", host="0.0.0.0", port=PORT)
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
