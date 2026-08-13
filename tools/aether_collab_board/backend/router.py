import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import List

from tools.aether_collab_board.backend.database import (
    init_board_db, get_or_create_board, get_board_state,
    save_node, delete_node, save_connector, delete_connector
)
from tools.aether_collab_board.backend.manager import RoomConnectionManager
from tools.aether_collab_board.backend.models import NodeSchema, ConnectorSchema

router = APIRouter(prefix="/api/collab-board", tags=["Aether Collab Board"])
ws_manager = RoomConnectionManager()

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "collab_board.db")

@router.on_event("startup")
async def startup_event():
    await init_board_db(DEFAULT_DB_PATH)

@router.get("/boards")
async def list_boards():
    board = await get_or_create_board(DEFAULT_DB_PATH, "default", "Quadro Principal")
    return [board]

@router.get("/boards/{board_id}")
async def get_board(board_id: str):
    board = await get_or_create_board(DEFAULT_DB_PATH, board_id)
    state = await get_board_state(DEFAULT_DB_PATH, board_id)
    return {"board": board, **state}

@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await ws_manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            payload = data.get("data", {})

            if msg_type in ("node_create", "node_update"):
                await save_node(DEFAULT_DB_PATH, payload)
            elif msg_type == "node_delete":
                await delete_node(DEFAULT_DB_PATH, payload.get("id"))
            elif msg_type in ("connector_create", "connector_update"):
                await save_connector(DEFAULT_DB_PATH, payload)
            elif msg_type == "connector_delete":
                await delete_connector(DEFAULT_DB_PATH, payload.get("id"))

            await ws_manager.broadcast(room_id, data, sender=websocket)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, room_id)
    except Exception:
        ws_manager.disconnect(websocket, room_id)
