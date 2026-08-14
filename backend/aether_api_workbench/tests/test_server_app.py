"""Test central server integration with Aether API Workbench."""

from fastapi.testclient import TestClient
from server import app

def test_central_server_root_dashboard():
    """Verify that root GET / serves dashboard HTML and does not trigger mock error."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "html" in response.text.lower()
    assert "Mock endpoint not found" not in response.text
