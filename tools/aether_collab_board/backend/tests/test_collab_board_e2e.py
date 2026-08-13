import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)

def test_e2e_static_files_served():
    response = client.get("/tools/aether_collab_board/index.html")
    assert response.status_code == 200
    assert "Aether Collab Board" in response.text
    assert "mermaid" in response.text

def test_e2e_api_and_board_state():
    response = client.get("/api/collab-board/boards/default")
    assert response.status_code == 200
    data = response.json()
    assert "board" in data
    assert "nodes" in data
    assert "connectors" in data
