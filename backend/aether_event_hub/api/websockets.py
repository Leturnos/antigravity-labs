from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    event_hub = websocket.app.state.event_hub
    await event_hub.connect(websocket)
    try:
        while True:
            # Keep connection open and receive ping/heartbeat messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        event_hub.disconnect(websocket)
    except Exception:
        event_hub.disconnect(websocket)
