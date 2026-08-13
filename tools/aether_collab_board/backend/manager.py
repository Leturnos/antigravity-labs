from typing import Dict, Set
from fastapi import WebSocket

class RoomConnectionManager:
    """Manages WebSocket client connections grouped by room_id."""

    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        self.rooms[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].discard(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]

    async def broadcast(self, room_id: str, message: dict, sender: WebSocket = None):
        if room_id not in self.rooms:
            return
        dead_connections = set()
        for connection in list(self.rooms[room_id]):
            if connection != sender:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.add(connection)
        for dead in dead_connections:
            self.disconnect(dead, room_id)
