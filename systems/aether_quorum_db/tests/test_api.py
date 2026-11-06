"""Integration tests for the Aether QuorumDB HTTP API."""

from fastapi.testclient import TestClient

from systems.aether_quorum_db.main import app

client = TestClient(app)


def test_should_report_healthy_service():
    response = client.get("/api/quorum/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
