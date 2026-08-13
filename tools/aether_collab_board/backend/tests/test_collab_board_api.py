import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_get_boards_endpoint():
    response = client.get("/api/collab-board/boards")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["id"] == "default"

def test_get_single_board_state():
    response = client.get("/api/collab-board/boards/default")
    assert response.status_code == 200
    data = response.json()
    assert "board" in data
    assert "nodes" in data
    assert "connectors" in data
