"""Tests for HTTP and WebSocket proxy endpoints and main application CRUD routes."""

import json
from unittest.mock import AsyncMock, patch

from fastapi import status
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.aether_api_workbench.database import Base, get_db
from backend.aether_api_workbench.main import app
from backend.aether_api_workbench.models import Collection, HistoryLog, MockEndpoint, SavedRequest
from backend.aether_api_workbench.proxy import measure_dns_time


from sqlalchemy.pool import StaticPool


@pytest.fixture
def db_engine():
    """Create an in-memory SQLite database engine for testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_engine):
    """Create a new database session for testing."""
    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=db_engine
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    """Create a TestClient with database session dependency override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ==================== Proxy Unit & Integration Tests ====================

@pytest.mark.asyncio
async def test_measure_dns_time():
    """Test DNS measurement helper function."""
    dns_ms = await measure_dns_time("https://localhost")
    assert isinstance(dns_ms, float)
    assert dns_ms >= 0.0

    dns_invalid = await measure_dns_time("invalid_url_without_schema")
    assert dns_invalid == 0.0


def test_http_proxy_success(client, db_session):
    """Test HTTP proxy endpoint with mocked upstream response."""
    mock_response = httpx.Response(
        status_code=200,
        content=b'{"message": "success"}',
        headers={"content-type": "application/json", "x-custom-header": "test"},
    )

    with patch.object(httpx.AsyncClient, "request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response

        payload = {
            "method": "POST",
            "url": "https://api.example.com/v1/data",
            "headers": {"Authorization": "Bearer token123"},
            "params": {"query": "test"},
            "body": {"key": "value"},
            "timeout_seconds": 15.0,
        }

        response = client.post("/api/proxy", json=payload)
        assert response.status_code == 200

        data = response.json()
        assert data["status_code"] == 200
        assert data["body"] == '{"message": "success"}'
        assert data["headers"]["content-type"] == "application/json"
        assert "execution_time_ms" in data
        assert "dns_time_ms" in data
        assert "ttfb_ms" in data
        assert "total_time_ms" in data
        assert "timing" in data
        assert data["is_mock"] is False

        # Verify entry created in HistoryLog
        history = db_session.query(HistoryLog).first()
        assert history is not None
        assert history.request_method == "POST"
        assert history.request_url == "https://api.example.com/v1/data"
        assert history.response_status == 200


def test_http_proxy_timeout_error(client):
    """Test HTTP proxy endpoint when upstream request times out."""
    with patch.object(
        httpx.AsyncClient,
        "request",
        side_effect=httpx.TimeoutException("Connection timed out"),
    ):
        payload = {
            "method": "GET",
            "url": "https://slow.example.com/api",
            "timeout_seconds": 2.0,
        }
        response = client.post("/api/proxy", json=payload)
        assert response.status_code == status.HTTP_504_GATEWAY_TIMEOUT
        assert "timed out" in response.json()["detail"]


def test_http_proxy_connect_error(client):
    """Test HTTP proxy endpoint when upstream connection fails."""
    request_obj = httpx.Request("GET", "https://unreachable.example.com")
    with patch.object(
        httpx.AsyncClient,
        "request",
        side_effect=httpx.ConnectError("Failed to connect", request=request_obj),
    ):
        payload = {
            "method": "GET",
            "url": "https://unreachable.example.com",
        }
        response = client.post("/api/proxy", json=payload)
        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert "Proxy error" in response.json()["detail"]


@pytest.mark.asyncio
async def test_websocket_proxy_missing_target():
    """Test WebSocket proxy without target_url parameter using AsyncMock."""
    from backend.aether_api_workbench.proxy import websocket_proxy
    mock_ws = AsyncMock()
    mock_ws.query_params = {}
    mock_ws.receive_text.side_effect = Exception("No initial frame")
    await websocket_proxy(mock_ws)
    mock_ws.accept.assert_called_once()
    mock_ws.send_json.assert_called_once()
    assert "error" in mock_ws.send_json.call_args[0][0]


@pytest.mark.asyncio
async def test_websocket_proxy_connect_failure():
    """Test WebSocket proxy when upstream connection fails using AsyncMock."""
    from backend.aether_api_workbench.proxy import websocket_proxy
    mock_ws = AsyncMock()
    mock_ws.query_params = {"target_url": "ws://invalid-target:9999"}
    with patch("websockets.connect", side_effect=Exception("WS connection refused")):
        await websocket_proxy(mock_ws)
        mock_ws.accept.assert_called_once()
        mock_ws.send_json.assert_called_once()
        assert "error" in mock_ws.send_json.call_args[0][0]


# ==================== Main App CRUD Endpoints Tests ====================

def test_health_check_and_static(client):
    """Test /api/health and /static endpoints."""
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    static_res = client.get("/static/index.html")
    assert static_res.status_code == 200
    assert "Aether API Workbench" in static_res.text


def test_collections_crud(client):
    """Test Collections CRUD endpoints."""
    # Create
    create_res = client.post(
        "/api/collections",
        json={"name": "Auth API", "description": "Authentication endpoints"},
    )
    assert create_res.status_code == 201
    col = create_res.json()
    col_id = col["id"]
    assert col["name"] == "Auth API"

    # List
    list_res = client.get("/api/collections")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # Get by ID
    get_res = client.get(f"/api/collections/{col_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Auth API"

    # Update
    put_res = client.put(
        f"/api/collections/{col_id}",
        json={"name": "Auth API v2", "description": "Updated description"},
    )
    assert put_res.status_code == 200
    assert put_res.json()["name"] == "Auth API v2"

    # Delete
    del_res = client.delete(f"/api/collections/{col_id}")
    assert del_res.status_code == 204

    # Verify deleted
    get_after_del = client.get(f"/api/collections/{col_id}")
    assert get_after_del.status_code == 404


def test_saved_requests_crud(client):
    """Test Saved Requests CRUD endpoints."""
    col_res = client.post("/api/collections", json={"name": "Payments API"})
    col_id = col_res.json()["id"]

    # Create
    req_res = client.post(
        "/api/saved-requests",
        json={
            "collection_id": col_id,
            "name": "Process Payment",
            "method": "POST",
            "url": "https://api.payments.com/charge",
            "body": '{"amount": 100}',
        },
    )
    assert req_res.status_code == 201
    req_data = req_res.json()
    req_id = req_data["id"]
    assert req_data["name"] == "Process Payment"

    # List
    list_res = client.get("/api/saved-requests", params={"collection_id": col_id})
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # Get
    get_res = client.get(f"/api/saved-requests/{req_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Process Payment"

    # Update
    put_res = client.put(
        f"/api/saved-requests/{req_id}",
        json={"name": "Process Credit Payment", "method": "PUT"},
    )
    assert put_res.status_code == 200
    assert put_res.json()["name"] == "Process Credit Payment"
    assert put_res.json()["method"] == "PUT"

    # Delete
    del_res = client.delete(f"/api/saved-requests/{req_id}")
    assert del_res.status_code == 204


def test_mock_endpoints_crud(client):
    """Test Mock Endpoints CRUD endpoints."""
    # Create
    create_res = client.post(
        "/api/mock-endpoints",
        json={
            "name": "Mock User Profile",
            "path": "/api/users/profile",
            "method": "GET",
            "status_code": 200,
            "response_body": '{"id": 1, "name": "Jane"}',
            "delay_ms": 50,
            "is_active": True,
        },
    )
    assert create_res.status_code == 201
    mock_ep = create_res.json()
    mock_id = mock_ep["id"]
    assert mock_ep["path"] == "/api/users/profile"

    # List
    list_res = client.get("/api/mock-endpoints")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # Get
    get_res = client.get(f"/api/mock-endpoints/{mock_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Mock User Profile"

    # Update
    put_res = client.put(
        f"/api/mock-endpoints/{mock_id}",
        json={"status_code": 201, "delay_ms": 0},
    )
    assert put_res.status_code == 200
    assert put_res.json()["status_code"] == 201

    # Call mock endpoint via main app router!
    mock_call_res = client.get("/mock/api/users/profile")
    assert mock_call_res.status_code == 201
    assert mock_call_res.json()["name"] == "Jane"

    # Delete
    del_res = client.delete(f"/api/mock-endpoints/{mock_id}")
    assert del_res.status_code == 204


def test_history_logs_crud(client, db_session):
    """Test History Log endpoints."""
    # Insert history items into DB
    h1 = HistoryLog(
        request_method="GET",
        request_url="https://api.test/1",
        response_status=200,
        execution_time_ms=10,
    )
    h2 = HistoryLog(
        request_method="POST",
        request_url="https://api.test/2",
        response_status=201,
        execution_time_ms=25,
    )
    db_session.add_all([h1, h2])
    db_session.commit()

    # List
    list_res = client.get("/api/history")
    assert list_res.status_code == 200
    logs = list_res.json()
    assert len(logs) == 2

    # Delete specific entry
    del_res = client.delete(f"/api/history/{h1.id}")
    assert del_res.status_code == 204

    # Clear remaining history
    clear_res = client.delete("/api/history")
    assert clear_res.status_code == 204

    list_after_clear = client.get("/api/history")
    assert len(list_after_clear.json()) == 0
