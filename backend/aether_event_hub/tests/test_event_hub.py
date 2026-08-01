import pytest
from unittest.mock import AsyncMock
from backend.aether_event_hub.core.event_hub import EventHub

@pytest.mark.asyncio
async def test_event_hub_broadcast():
    hub = EventHub()
    mock_ws = AsyncMock()
    
    await hub.connect(mock_ws)
    assert len(hub.active_connections) == 1
    
    await hub.broadcast("task_created", {"id": "123", "name": "sample"})
    mock_ws.send_json.assert_called_once()
    payload = mock_ws.send_json.call_args[0][0]
    assert payload["type"] == "task_created"
    assert payload["data"] == {"id": "123", "name": "sample"}
    
    hub.disconnect(mock_ws)
    assert len(hub.active_connections) == 0
