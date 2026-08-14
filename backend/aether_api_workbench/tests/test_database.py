"""Tests for database setup and SQLAlchemy models in Aether API Workbench."""

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from backend.aether_api_workbench.database import Base, get_db, init_db
from backend.aether_api_workbench.models import (
    Collection,
    SavedRequest,
    MockEndpoint,
    HistoryLog,
)


@pytest.fixture
def db_engine():
    """Create an in-memory SQLite database engine for testing."""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
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


def test_init_db_creates_tables(db_engine):
    """Test that init_db creates all expected database tables."""
    init_db(target_engine=db_engine)
    inspector = inspect(db_engine)
    table_names = inspector.get_table_names()

    expected_tables = ["collections", "saved_requests", "mock_endpoints", "history_logs"]
    for table in expected_tables:
        assert table in table_names


def test_get_db_yields_session(db_engine, monkeypatch):
    """Test get_db dependency generator yields a valid session."""
    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=db_engine
    )
    monkeypatch.setattr(
        "backend.aether_api_workbench.database.SessionLocal", TestingSessionLocal
    )

    gen = get_db()
    db = next(gen)
    assert db is not None
    with pytest.raises(StopIteration):
        next(gen)


def test_collection_and_saved_request_crud(db_session):
    """Test CRUD operations and relationships for Collection and SavedRequest."""
    collection = Collection(
        name="User Service API", description="Endpoints for user management"
    )
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)

    assert collection.id is not None
    assert collection.name == "User Service API"

    req1 = SavedRequest(
        collection_id=collection.id,
        name="Get User Profile",
        method="GET",
        url="https://api.example.com/users/1",
        headers='{"Authorization": "Bearer token123"}',
    )
    req2 = SavedRequest(
        collection_id=collection.id,
        name="Create User",
        method="POST",
        url="https://api.example.com/users",
        body='{"name": "Alice"}',
    )
    db_session.add_all([req1, req2])
    db_session.commit()

    db_session.refresh(collection)
    assert len(collection.requests) == 2
    assert collection.requests[0].name == "Get User Profile"

    # Test cascade delete
    db_session.delete(collection)
    db_session.commit()

    remaining_requests = (
        db_session.query(SavedRequest)
        .filter_by(collection_id=collection.id)
        .all()
    )
    assert len(remaining_requests) == 0


def test_mock_endpoint_crud(db_session):
    """Test CRUD operations for MockEndpoint model."""
    mock_ep = MockEndpoint(
        name="Mock Auth Login",
        path="/api/v1/auth/login",
        method="POST",
        status_code=200,
        response_headers='{"Content-Type": "application/json"}',
        response_body='{"token": "xyz123"}',
        delay_ms=100,
        is_active=True,
    )
    db_session.add(mock_ep)
    db_session.commit()
    db_session.refresh(mock_ep)

    assert mock_ep.id is not None
    assert mock_ep.path == "/api/v1/auth/login"
    assert mock_ep.is_active is True

    # Query active endpoint by path and method
    queried = (
        db_session.query(MockEndpoint)
        .filter_by(path="/api/v1/auth/login", method="POST", is_active=True)
        .first()
    )
    assert queried is not None
    assert queried.status_code == 200


def test_history_log_crud(db_session):
    """Test CRUD operations for HistoryLog model."""
    log = HistoryLog(
        request_method="GET",
        request_url="https://api.example.com/status",
        request_headers='{"Accept": "application/json"}',
        request_body=None,
        response_status=200,
        response_headers='{"Content-Type": "application/json"}',
        response_body='{"status": "ok"}',
        execution_time_ms=45,
        is_mock=False,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)

    assert log.id is not None
    assert log.request_method == "GET"
    assert log.response_status == 200
    assert log.execution_time_ms == 45
    assert log.is_mock is False
