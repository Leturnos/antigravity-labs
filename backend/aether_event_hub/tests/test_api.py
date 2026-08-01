import pytest
import os
from fastapi.testclient import TestClient
from backend.aether_event_hub.main import app

@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tmp_dir = tmp_path_factory.mktemp("db")
    db_file = str(tmp_dir / "api_test.db")
    os.environ["AETHER_DB_PATH"] = db_file
    
    with TestClient(app) as test_client:
        yield test_client

def test_api_flow(client):
    # 1. Check initial metrics
    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    metrics = resp.json()
    assert "active_workers" in metrics
    assert "counts" in metrics

    # 2. Post a task
    create_resp = client.post("/api/tasks", json={
        "name": "send_email",
        "payload": {"to": "test@aether.io", "subject": "Unit Test"},
        "priority": 8
    })
    assert create_resp.status_code == 201
    task_id = create_resp.json()["id"]

    # 3. List tasks
    list_resp = client.get("/api/tasks")
    assert list_resp.status_code == 200
    tasks_data = list_resp.json()
    assert tasks_data["total"] >= 1

    # 4. Get task detail
    detail_resp = client.get(f"/api/tasks/{task_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["id"] == task_id
