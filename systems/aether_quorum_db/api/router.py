"""FastAPI router for Aether QuorumDB REST and WebSocket endpoints."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from .. import __version__
from ..replication.sql_state_machine import SqlStateMachine
from ..simulation import faults
from ..simulation.cluster import SimulationCluster
from ..simulation.network import NetworkConfig
from ..sql.errors import SqlError
from .schemas import (
    ClusterStateResponse,
    FaultRequest,
    NetworkState,
    NodeState,
    QueryRequest,
    QueryResponse,
    StepRequest,
)
from .ws import ws_manager

router = APIRouter(prefix="/api/quorum", tags=["quorum"])

_cluster: SimulationCluster | None = None
_auto_tick_enabled: bool = False


def get_cluster() -> SimulationCluster:
    global _cluster
    if _cluster is None:
        _cluster = SimulationCluster(
            node_ids=[0, 1, 2],
            seed=42,
            network_config=NetworkConfig(min_latency=1, max_latency=2, drop_rate=0.0),
            state_machine_factory=SqlStateMachine,
        )
        # Advance initial election and seed demo tables
        _cluster.run_until_leader(max_ticks=100)
        try:
            _cluster.execute_sql("CREATE TABLE users (id INT PRIMARY KEY, name TEXT, role TEXT, balance INT);")
            _cluster.execute_sql(
                "INSERT INTO users (id, name, role, balance) VALUES "
                "(1, 'Alice', 'Architect', 1200), (2, 'Bob', 'Engineer', 950), (3, 'Charlie', 'Designer', 800);"
            )
            _cluster.execute_sql("CREATE TABLE logs (id INT PRIMARY KEY, message TEXT, severity TEXT);")
            _cluster.execute_sql(
                "INSERT INTO logs (id, message, severity) VALUES "
                "(1, 'Cluster initialized', 'INFO'), (2, 'Raft leader established', 'NOTICE');"
            )
        except SqlError:
            pass
    return _cluster


def build_cluster_state(c: SimulationCluster) -> ClusterStateResponse:
    leader = c.leader
    nodes_state: list[NodeState] = []
    checksums = c.get_state_checksums()

    for nid in c.node_ids:
        node = c.nodes[nid]
        is_running = c.is_running(nid)
        nodes_state.append(
            NodeState(
                node_id=int(nid),
                role=node.role.value if is_running else "crashed",
                term=node.current_term,
                leader_id=int(node.leader_id) if node.leader_id is not None and is_running else None,
                commit_index=node.commit_index,
                last_applied=node.last_applied,
                log_length=node.log.last_index,
                last_included_index=node.log.last_included_index,
                is_running=is_running,
                state_checksum=checksums.get(nid),
            )
        )

    partitions_raw = c.network.partitions
    partitions_int = [[int(x) for x in grp] for grp in partitions_raw]

    net_state = NetworkState(
        sent=c.network.stats.sent,
        delivered=c.network.stats.delivered,
        dropped=c.network.stats.dropped,
        blocked=c.network.stats.blocked,
        in_flight_count=len(c.network.in_flight()),
        partitions=partitions_int,
    )

    return ClusterStateResponse(
        clock=c.clock.now,
        leader_id=int(leader.node_id) if leader is not None else None,
        nodes=nodes_state,
        network=net_state,
        auto_tick=_auto_tick_enabled,
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "Aether QuorumDB", "version": __version__}


@router.get("/state", response_model=ClusterStateResponse)
def get_state() -> ClusterStateResponse:
    return build_cluster_state(get_cluster())


@router.post("/step", response_model=ClusterStateResponse)
def step_simulation(req: StepRequest) -> ClusterStateResponse:
    c = get_cluster()
    c.step(ticks=req.ticks)
    state = build_cluster_state(c)
    ws_manager.broadcast("cluster_state", state.model_dump())
    return state


@router.post("/sql", response_model=QueryResponse)
def execute_sql(req: QueryRequest) -> QueryResponse:
    c = get_cluster()
    start_t = time.perf_counter()
    try:
        res = c.execute_sql(req.sql)
        duration_ms = (time.perf_counter() - start_t) * 1000.0

        cols = getattr(res, "columns", ["status"])
        rows = getattr(res, "rows", [])
        serialized_rows = [[x for x in r] for r in rows]

        state = build_cluster_state(c)
        ws_manager.broadcast("cluster_state", state.model_dump())

        return QueryResponse(
            columns=cols,
            rows=serialized_rows,
            row_count=len(rows),
            execution_time_ms=round(duration_ms, 2),
            status="ok",
        )
    except Exception as exc:  # noqa: BLE001
        duration_ms = (time.perf_counter() - start_t) * 1000.0
        return QueryResponse(
            columns=["error"],
            rows=[[str(exc)]],
            row_count=0,
            execution_time_ms=round(duration_ms, 2),
            status="error",
            error=str(exc),
        )


@router.post("/fault", response_model=ClusterStateResponse)
def inject_fault(req: FaultRequest) -> ClusterStateResponse:
    c = get_cluster()
    action = req.action.lower()

    if action == "isolate_leader":
        faults.isolate_leader(c)
    elif action == "crash_node":
        if req.node_id is None:
            raise HTTPException(status_code=400, detail="node_id required for crash_node")
        c.crash_node(req.node_id)
    elif action == "restart_node":
        if req.node_id is None:
            raise HTTPException(status_code=400, detail="node_id required for restart_node")
        c.restart_node(req.node_id)
    elif action == "flaky_network":
        faults.flaky_network(c, drop_rate=0.25, max_latency=6)
    elif action in ("reset_network", "heal"):
        faults.reset_network(c)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown fault action: {req.action}")

    state = build_cluster_state(c)
    ws_manager.broadcast("cluster_state", state.model_dump())
    return state


@router.post("/reset", response_model=ClusterStateResponse)
def reset_cluster() -> ClusterStateResponse:
    global _cluster
    _cluster = None
    c = get_cluster()
    state = build_cluster_state(c)
    ws_manager.broadcast("cluster_state", state.model_dump())
    return state


@router.post("/auto-tick")
def toggle_auto_tick(enabled: bool) -> dict[str, Any]:
    global _auto_tick_enabled
    _auto_tick_enabled = enabled
    return {"auto_tick": _auto_tick_enabled}


# ============================================================================
# WebSocket Telemetry Stream
# ============================================================================

async def quorum_ws_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        # Send initial state immediately
        c = get_cluster()
        initial_state = build_cluster_state(c)
        await websocket.send_json({"type": "cluster_state", "data": initial_state.model_dump()})

        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, asyncio.CancelledError):
        ws_manager.disconnect(websocket)
