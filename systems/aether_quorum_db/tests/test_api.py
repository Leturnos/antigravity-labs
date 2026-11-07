"""Integration tests for the Aether QuorumDB HTTP & WebSocket API."""

from fastapi.testclient import TestClient

from systems.aether_quorum_db.main import app

client = TestClient(app)


def test_should_report_healthy_service():
    response = client.get("/api/quorum/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_cluster_state():
    response = client.get("/api/quorum/state")
    assert response.status_code == 200
    data = response.json()
    assert "clock" in data
    assert "nodes" in data
    assert len(data["nodes"]) == 3
    assert "network" in data


def test_step_simulation_endpoint():
    initial_clock = client.get("/api/quorum/state").json()["clock"]
    resp = client.post("/api/quorum/step", json={"ticks": 5})
    assert resp.status_code == 200
    new_clock = resp.json()["clock"]
    assert new_clock >= initial_clock + 5


def test_sql_execution_via_api():
    # SELECT pre-seeded table
    resp = client.post("/api/quorum/sql", json={"sql": "SELECT name, role FROM users WHERE id = 1;"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["columns"] == ["name", "role"]
    assert data["rows"] == [["Alice", "Architect"]]

    # INSERT new row
    ins_resp = client.post(
        "/api/quorum/sql",
        json={"sql": "INSERT INTO users (id, name, role, balance) VALUES (99, 'Tester', 'QA', 999);"},
    )
    assert ins_resp.status_code == 200
    assert ins_resp.json()["status"] == "ok"


def test_fault_injection_api():
    # Crash node 2
    crash_resp = client.post("/api/quorum/fault", json={"action": "crash_node", "node_id": 2})
    assert crash_resp.status_code == 200
    nodes = crash_resp.json()["nodes"]
    node_2 = next(n for n in nodes if n["node_id"] == 2)
    assert node_2["is_running"] is False
    assert node_2["role"] == "crashed"

    # Restart node 2
    restart_resp = client.post("/api/quorum/fault", json={"action": "restart_node", "node_id": 2})
    assert restart_resp.status_code == 200
    nodes = restart_resp.json()["nodes"]
    node_2_restart = next(n for n in nodes if n["node_id"] == 2)
    assert node_2_restart["is_running"] is True

    # Isolate leader
    iso_resp = client.post("/api/quorum/fault", json={"action": "isolate_leader"})
    assert iso_resp.status_code == 200

    # Heal network
    heal_resp = client.post("/api/quorum/fault", json={"action": "heal"})
    assert heal_resp.status_code == 200


def test_websocket_telemetry_connection():
    with client.websocket_connect("/ws/quorum") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "cluster_state"
        assert "nodes" in msg["data"]
