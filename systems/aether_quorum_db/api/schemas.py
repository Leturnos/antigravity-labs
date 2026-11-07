"""Pydantic schemas for the QuorumDB REST API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    sql: str = Field(..., description="SQL query or statement to execute")


class QueryResponse(BaseModel):
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)
    row_count: int = 0
    execution_time_ms: float = 0.0
    status: str = "ok"
    error: str | None = None


class NodeState(BaseModel):
    node_id: int
    role: str
    term: int
    leader_id: int | None = None
    commit_index: int = 0
    last_applied: int = 0
    log_length: int = 0
    last_included_index: int = 0
    is_running: bool = True
    state_checksum: str | None = None


class NetworkState(BaseModel):
    sent: int = 0
    delivered: int = 0
    dropped: int = 0
    blocked: int = 0
    in_flight_count: int = 0
    partitions: list[list[int]] = Field(default_factory=list)
    drop_rate: float = 0.0
    max_latency: int = 2
    is_degraded: bool = False


class ClusterStateResponse(BaseModel):
    clock: int
    leader_id: int | None = None
    nodes: list[NodeState] = Field(default_factory=list)
    network: NetworkState
    auto_tick: bool = False


class StepRequest(BaseModel):
    ticks: int = Field(default=1, ge=1, le=100)


class FaultRequest(BaseModel):
    action: str = Field(
        ...,
        description="isolate_leader | crash_node | restart_node | flaky_network | reset_network | heal",
    )
    node_id: int | None = None
