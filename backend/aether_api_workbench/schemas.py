"""Pydantic schemas for Aether API Workbench."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ==================== SavedRequest Schemas ====================

class SavedRequestBase(BaseModel):
    collection_id: Optional[int] = None
    name: str
    method: str = "GET"
    url: str
    headers: Optional[str] = "{}"
    params: Optional[str] = "{}"
    body: Optional[str] = None


class SavedRequestCreate(SavedRequestBase):
    pass


class SavedRequestUpdate(BaseModel):
    collection_id: Optional[int] = None
    name: Optional[str] = None
    method: Optional[str] = None
    url: Optional[str] = None
    headers: Optional[str] = None
    params: Optional[str] = None
    body: Optional[str] = None


class SavedRequestOut(SavedRequestBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


SavedRequest = SavedRequestOut


# ==================== Collection Schemas ====================

class CollectionBase(BaseModel):
    name: str
    description: Optional[str] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CollectionOut(CollectionBase):
    id: int
    created_at: datetime
    updated_at: datetime
    requests: List[SavedRequestOut] = []

    model_config = ConfigDict(from_attributes=True)


Collection = CollectionOut


# ==================== MockEndpoint Schemas ====================

class MockEndpointBase(BaseModel):
    name: str
    path: str
    method: str = "GET"
    status_code: int = 200
    response_headers: Optional[str] = "{}"
    response_body: Optional[str] = None
    delay_ms: int = 0
    is_active: bool = True


class MockEndpointCreate(MockEndpointBase):
    pass


class MockEndpointUpdate(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    response_headers: Optional[str] = None
    response_body: Optional[str] = None
    delay_ms: Optional[int] = None
    is_active: Optional[bool] = None


class MockEndpointOut(MockEndpointBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


MockEndpoint = MockEndpointOut


# ==================== Proxy Schemas ====================

class ProxyRequestPayload(BaseModel):
    method: str = "GET"
    url: str
    headers: Optional[Dict[str, str]] = None
    params: Optional[Dict[str, Any]] = None
    body: Optional[Any] = None
    timeout_seconds: float = 30.0


class ProxyResponseOut(BaseModel):
    status_code: int
    headers: Dict[str, str] = Field(default_factory=dict)
    body: str
    execution_time_ms: int
    is_mock: bool = False
    dns_time_ms: Optional[float] = None
    ttfb_ms: Optional[float] = None
    total_time_ms: Optional[float] = None
    timing: Optional[Dict[str, float]] = None

    model_config = ConfigDict(from_attributes=True)

