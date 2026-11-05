"""FastAPI Router exposing REST API endpoints for LSM-Tree Storage Internals."""

from __future__ import annotations

import random
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from ..engine.lsm_tree import LSMTreeEngine
from .schemas import ActionResponse, BenchmarkRequest, PutRequest
from .ws import ws_manager

router = APIRouter(prefix="/api/storage", tags=["storage"])

# Engine singleton reference (initialized during lifespan or first request)
_engine: Optional[LSMTreeEngine] = None
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def get_engine() -> LSMTreeEngine:
    global _engine
    if _engine is None:
        def on_event(event_type: str, data: Dict[str, Any]):
            ws_manager.broadcast(event_type, data)

        _engine = LSMTreeEngine(
            data_dir=DATA_DIR,
            memtable_threshold_bytes=16384,  # 16 KB for dynamic visual demonstration
            sync_wal=True,
            l0_compaction_threshold=3,
            event_callback=on_event,
        )
    return _engine


# ==================== Telemetry & State ====================

@router.get("/state")
def get_state() -> Dict[str, Any]:
    """Returns the full engine state snapshot for dashboard telemetry."""
    engine = get_engine()
    return engine.get_state()


@router.get("/raw-block/{filename}")
def get_raw_block(filename: str) -> Dict[str, Any]:
    """Returns formatted hex dump and layout analysis of a WAL or SSTable file."""
    engine = get_engine()
    try:
        return engine.inspect_raw_file(filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== KV Operations ====================

@router.post("/kv")
def put_key_value(payload: PutRequest) -> Dict[str, Any]:
    """Stores a key-value pair."""
    engine = get_engine()
    rec = engine.put(payload.key, payload.value)
    return {
        "key": rec.key_str,
        "value": rec.value_str,
        "timestamp": rec.timestamp,
        "is_tombstone": False,
        "encoded_size": rec.encoded_size(),
    }


@router.get("/kv/{key}")
def get_key_value(key: str) -> Dict[str, Any]:
    """Point lookup for a key."""
    engine = get_engine()
    rec = engine.get(key)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Chave '{key}' não encontrada ou excluída")
    return {
        "key": rec.key_str,
        "value": rec.value_str,
        "timestamp": rec.timestamp,
        "is_tombstone": rec.is_tombstone,
    }


@router.delete("/kv/{key}")
def delete_key(key: str) -> Dict[str, Any]:
    """Appends a deletion tombstone for key."""
    engine = get_engine()
    tombstone = engine.delete(key)
    return {
        "key": tombstone.key_str,
        "timestamp": tombstone.timestamp,
        "is_tombstone": True,
        "message": f"Lápide de exclusão (tombstone) gravada para a chave '{key}'",
    }


@router.get("/scan")
def scan_keys(
    start_key: Optional[str] = Query(None),
    end_key: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
) -> List[Dict[str, Any]]:
    """Range scan across sorted keys."""
    engine = get_engine()
    records = engine.scan(start_key=start_key, end_key=end_key, limit=limit)
    return [
        {
            "key": r.key_str,
            "value": r.value_str,
            "timestamp": r.timestamp,
            "is_tombstone": r.is_tombstone,
        }
        for r in records
    ]


@router.get("/trace/{key}")
def trace_get(key: str) -> Dict[str, Any]:
    """Traced query inspecting each memory and disk layer for key."""
    engine = get_engine()
    trace_res = engine.trace_get(key)
    return trace_res.to_dict()


# ==================== Storage Actions ====================

@router.post("/actions/flush", response_model=ActionResponse)
def trigger_flush() -> ActionResponse:
    """Forces an immediate flush of the active MemTable into an L0 SSTable."""
    engine = get_engine()
    meta = engine.flush()
    if meta is None:
        return ActionResponse(status="skipped", message="MemTable ativa está vazia, nenhum dado para descarregar em disco")
    return ActionResponse(
        status="ok",
        message=f"Flush realizado com sucesso: MemTable persistida na SSTable {meta.file_id} ({meta.record_count} registros, {meta.file_size} bytes)",
        data=meta.to_dict(),
    )


@router.post("/actions/compact", response_model=ActionResponse)
def trigger_compaction(source_level: int = Query(0, ge=0, le=1)) -> ActionResponse:
    """Triggers an on-demand compaction cycle from source_level."""
    engine = get_engine()
    report = engine.compact(source_level=source_level)
    return ActionResponse(
        status="ok",
        message=f"Compactação do Nível {source_level} para {report.target_level} concluída: {report.records_merged} registros mesclados, {report.tombstones_purged} lápides purgadas.",
        data=report.to_dict(),
    )


@router.post("/actions/crash", response_model=ActionResponse)
def trigger_crash() -> ActionResponse:
    """Simulates an abrupt process crash by dropping RAM buffers without flushing."""
    engine = get_engine()
    crash_info = engine.simulate_crash()
    return ActionResponse(
        status="crashed",
        message="Queda súbita do sistema simulada! Memória RAM volátil descartada. Arquivos WAL preservados no disco para recuperação.",
        data=crash_info,
    )


@router.post("/actions/recover", response_model=ActionResponse)
def trigger_recovery() -> ActionResponse:
    """Replays the Write-Ahead Log from disk to restore in-memory state."""
    engine = get_engine()
    report = engine.recover()
    return ActionResponse(
        status="recovered",
        message=f"Recuperação finalizada: {report.wal_files_scanned} arquivos WAL analisados, {report.records_recovered} registros restaurados em {report.duration_ms} ms.",
        data=report.to_dict(),
    )


@router.post("/bench", response_model=ActionResponse)
def run_benchmark(payload: BenchmarkRequest) -> ActionResponse:
    """Executes an automated workload to measure throughput and write amplification."""
    engine = get_engine()
    count = payload.count
    prefix = payload.key_prefix
    workload = payload.workload

    start_time = time.time()
    records_written = 0
    records_read = 0

    if workload == "sequential":
        for i in range(count):
            k = f"{prefix}:{i:06d}"
            v = f"seq_payload_data_{i:06d}_{'x'*32}"
            engine.put(k, v)
            records_written += 1

    elif workload == "random":
        for _ in range(count):
            idx = random.randint(0, count * 5)
            k = f"{prefix}:rnd_{idx:06d}"
            v = f"random_val_{random.random():.6f}_{'r'*32}"
            engine.put(k, v)
            records_written += 1

    elif workload == "churn":
        # Mixed 60% Writes, 20% Deletes, 20% Reads
        for i in range(count):
            op = random.random()
            idx = random.randint(0, max(1, i))
            k = f"{prefix}:{idx:05d}"
            if op < 0.60:
                engine.put(k, f"churn_val_{time.time_ns()}")
                records_written += 1
            elif op < 0.80:
                engine.delete(k)
                records_written += 1
            else:
                engine.get(k)
                records_read += 1

    duration = time.time() - start_time
    throughput = round((records_written + records_read) / max(0.001, duration), 1)

    return ActionResponse(
        status="completed",
        message=f"Benchmark '{workload}' finalizado: {records_written + records_read} operações em {duration:.3f}s ({throughput} ops/s)",
        data={
            "workload": workload,
            "total_ops": records_written + records_read,
            "records_written": records_written,
            "records_read": records_read,
            "duration_seconds": round(duration, 3),
            "throughput_ops_per_sec": throughput,
        },
    )
