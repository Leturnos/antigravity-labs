"""SQLAlchemy models for Aether API Workbench."""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


def utcnow():
    """Helper returning current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class Collection(Base):
    """Collection model for grouping saved API requests."""

    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    requests = relationship(
        "SavedRequest", back_populates="collection", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Collection(id={self.id}, name='{self.name}')>"


class SavedRequest(Base):
    """Saved HTTP request model associated with a Collection."""

    __tablename__ = "saved_requests"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(
        Integer, ForeignKey("collections.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False, default="GET")
    url = Column(Text, nullable=False)
    headers = Column(Text, nullable=True, default="{}")
    params = Column(Text, nullable=True, default="{}")
    body = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    collection = relationship("Collection", back_populates="requests")

    def __repr__(self):
        return f"<SavedRequest(id={self.id}, name='{self.name}', method='{self.method}')>"


class MockEndpoint(Base):
    """Mock endpoint model for configuring fake API responses."""

    __tablename__ = "mock_endpoints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    path = Column(String(500), nullable=False, index=True)
    method = Column(String(10), nullable=False, default="GET")
    status_code = Column(Integer, nullable=False, default=200)
    response_headers = Column(Text, nullable=True, default="{}")
    response_body = Column(Text, nullable=True)
    delay_ms = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    def __repr__(self):
        return f"<MockEndpoint(id={self.id}, path='{self.path}', method='{self.method}')>"


class HistoryLog(Base):
    """Log model for tracking request execution history."""

    __tablename__ = "history_logs"

    id = Column(Integer, primary_key=True, index=True)
    request_method = Column(String(10), nullable=False)
    request_url = Column(Text, nullable=False)
    request_headers = Column(Text, nullable=True)
    request_body = Column(Text, nullable=True)
    response_status = Column(Integer, nullable=False)
    response_headers = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    is_mock = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    def __repr__(self):
        return f"<HistoryLog(id={self.id}, method='{self.request_method}', status={self.response_status})>"
