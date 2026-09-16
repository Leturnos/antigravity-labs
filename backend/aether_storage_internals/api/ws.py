"""WebSocket broadcaster for real-time engine telemetry streaming."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Set
from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections for telemetry broadcasting."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        if self._loop is None or not self._loop.is_running():
            self._loop = asyncio.get_running_loop()
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def _send_json(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            self.disconnect(websocket)

    def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        """Broadcasts an event message across all connected WebSockets."""
        if not self.active_connections:
            return

        message = {"type": event_type, "data": data}

        loop = self._loop
        if loop is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return

        for ws in list(self.active_connections):
            try:
                asyncio.run_coroutine_threadsafe(self._send_json(ws, message), loop)
            except Exception:
                pass


ws_manager = ConnectionManager()
