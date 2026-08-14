"""Tests for Pydantic schemas and Mock Engine in Aether API Workbench."""

import time
import pytest
from datetime import datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.aether_api_workbench.database import Base, get_db
from backend.aether_api_workbench.models import MockEndpoint
from backend.aether_api_workbench.schemas import (
    Collection,
    CollectionCreate,
    CollectionOut,
    SavedRequest,
    SavedRequestCreate,
    SavedRequestOut,
    MockEndpoint as MockEndpointSchema,
    MockEndpointCreate,
    MockEndpointOut,
    ProxyRequestPayload,
    ProxyResponseOut,
)
from backend.aether_api_workbench.mock_engine import (
    generate_fake_from_schema,
    mock_router,
)


# ==================== Schema Tests ====================

def test_pydantic_schemas_instantiation():
    """Test Pydantic schemas instantiation and validation."""
    col_create = CollectionCreate(name="Test Collection", description="Desc")
    assert col_create.name == "Test Collection"

    req_create = SavedRequestCreate(
        name="Test Request",
        method="POST",
        url="https://api.example.com",
        headers='{"Content-Type": "application/json"}',
    )
    assert req_create.method == "POST"

    mock_create = MockEndpointCreate(
        name="Test Mock",
        path="/api/test",
        method="GET",
        status_code=200,
        delay_ms=50,
    )
    assert mock_create.path == "/api/test"

    proxy_payload = ProxyRequestPayload(
        method="GET",
        url="https://httpbin.org/get",
        headers={"Accept": "application/json"},
    )
    assert proxy_payload.url == "https://httpbin.org/get"

    proxy_out = ProxyResponseOut(
        status_code=200,
        headers={"content-type": "application/json"},
        body='{"ok": true}',
        execution_time_ms=120,
        is_mock=False,
    )
    assert proxy_out.status_code == 200
    assert proxy_out.is_mock is False


# ==================== Generator Tests ====================

def test_generate_fake_from_schema_primitives():
    """Test fake generation for primitive types."""
    assert generate_fake_from_schema({"type": "integer"}) == 100
    assert generate_fake_from_schema({"type": "number"}) == 1.0
    assert generate_fake_from_schema({"type": "boolean"}) is True
    assert generate_fake_from_schema({"type": "null"}) is None


def test_generate_fake_from_schema_semantic_inferencing():
    """Test semantic inferencing based on key names and formats."""
    # Email inference
    email_res = generate_fake_from_schema({"type": "string", "format": "email"}, key_name="user_email")
    assert "@" in email_res

    # UUID inference
    uuid_res = generate_fake_from_schema({"type": "string", "format": "uuid"}, key_name="id")
    assert len(uuid_res) == 36

    # Date-time inference
    dt_res = generate_fake_from_schema({"type": "string", "format": "date-time"}, key_name="created_at")
    assert "T" in dt_res

    # Price / amount numeric inference
    price_res = generate_fake_from_schema({"type": "number"}, key_name="price")
    assert price_res == 99.99

    # Enum / Example / Default overrides
    enum_res = generate_fake_from_schema({"type": "string", "enum": ["admin", "user"]})
    assert enum_res == "admin"

    ex_res = generate_fake_from_schema({"type": "string", "example": "custom_val"})
    assert ex_res == "custom_val"


def test_generate_fake_from_schema_object_and_array():
    """Test fake generation for complex objects and arrays."""
    schema = {
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
            "name": {"type": "string"},
            "email": {"type": "string", "format": "email"},
            "tags": {
                "type": "array",
                "items": {"type": "string"}
            }
        }
    }
    result = generate_fake_from_schema(schema)
    assert isinstance(result, dict)
    assert result["id"] == 1
    assert "name" in result
    assert "@" in result["email"]
    assert isinstance(result["tags"], list)
    assert len(result["tags"]) == 1


from sqlalchemy.pool import StaticPool


# ==================== Mock Router Endpoint Tests ====================

@pytest.fixture
def mock_db():
    """Create in-memory database engine and session for router tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=engine
    )
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(mock_db):
    """Create FastAPI test client with DB session dependency override."""
    app = FastAPI()
    app.include_router(mock_router)

    def _override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


def test_mock_router_raw_json_response(client, mock_db):
    """Test mock router returning raw JSON response."""
    endpoint = MockEndpoint(
        name="User Profile Mock",
        path="/api/v1/user",
        method="GET",
        status_code=200,
        response_headers='{"X-Mock": "true"}',
        response_body='{"id": 42, "username": "alice"}',
        delay_ms=0,
        is_active=True,
    )
    mock_db.add(endpoint)
    mock_db.commit()

    response = client.get("/mock/api/v1/user")
    assert response.status_code == 200
    assert response.headers.get("x-mock") == "true"
    assert response.json() == {"id": 42, "username": "alice"}


def test_mock_router_schema_generated_response(client, mock_db):
    """Test mock router generating response from JSON Schema."""
    schema_body = """{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "product_id": {"type": "integer"},
            "price": {"type": "number"},
            "user_email": {"type": "string", "format": "email"}
        }
    }"""
    endpoint = MockEndpoint(
        name="Schema Mock",
        path="/api/v1/product",
        method="POST",
        status_code=201,
        response_headers='{"Content-Type": "application/json"}',
        response_body=schema_body,
        delay_ms=0,
        is_active=True,
    )
    mock_db.add(endpoint)
    mock_db.commit()

    response = client.post("/mock/api/v1/product", json={"request": "data"})
    assert response.status_code == 201
    data = response.json()
    assert data["product_id"] == 1
    assert data["price"] == 99.99
    assert "@" in data["user_email"]


def test_mock_router_delay_and_headers(client, mock_db):
    """Test mock router applying delay and custom status/headers."""
    endpoint = MockEndpoint(
        name="Delayed Endpoint",
        path="/api/v1/slow",
        method="GET",
        status_code=202,
        response_headers='{"X-Custom-Status": "Accepted", "X-Delay-Ms": "100"}',
        response_body='{"status": "processing"}',
        delay_ms=100,
        is_active=True,
    )
    mock_db.add(endpoint)
    mock_db.commit()

    start_time = time.time()
    response = client.get("/mock/api/v1/slow")
    elapsed_ms = (time.time() - start_time) * 1000

    assert response.status_code == 202
    assert response.headers.get("x-custom-status") == "Accepted"
    assert response.json() == {"status": "processing"}
    assert elapsed_ms >= 80  # allow small tolerance in timing test


def test_mock_router_not_found(client):
    """Test mock router returning 404 for non-existent endpoint."""
    response = client.get("/mock/api/v1/nonexistent")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_mock_router_inactive_endpoint(client, mock_db):
    """Test mock router ignoring inactive endpoints (returning 404)."""
    endpoint = MockEndpoint(
        name="Inactive Mock",
        path="/api/v1/disabled",
        method="GET",
        status_code=200,
        response_body='{"active": false}',
        is_active=False,
    )
    mock_db.add(endpoint)
    mock_db.commit()

    response = client.get("/mock/api/v1/disabled")
    assert response.status_code == 404
