"""Pydantic schemas for Aether Storage Internals API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PutRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=1024, description="Unique key")
    value: str = Field(..., max_length=65536, description="Data value payload")


class ScanQuery(BaseModel):
    start_key: Optional[str] = None
    end_key: Optional[str] = None
    limit: int = Field(default=50, ge=1, le=500)


class BenchmarkRequest(BaseModel):
    workload: str = Field(default="sequential", description="sequential | random | churn")
    count: int = Field(default=100, ge=10, le=2000)
    key_prefix: str = Field(default="bench")


class ActionResponse(BaseModel):
    status: str
    message: str
    data: Optional[Dict[str, Any]] = None
