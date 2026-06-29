from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "Library API"}
