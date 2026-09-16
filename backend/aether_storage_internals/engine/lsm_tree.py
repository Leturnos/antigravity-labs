"""Unified LSM-Tree Storage Engine orchestrating WAL, MemTable, SSTables, and Compaction."""

from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from .compaction import CompactionEngine
from .memtable import MemTable
from .sstable import SSTableReader, SSTableWriter
from .types import (
    CompactionReport,
    Record,
    RecoveryReport,
    SSTableMeta,
    TraceResult,
    TraceStep,
)
from .wal import WriteAheadLog


class LSMTreeEngine:
    """Production-grade miniature LSM-Tree Key-Value Storage Engine."""

    def __init__(
        self,
        data_dir: Path,
        memtable_threshold_bytes: int = 32768,  # Default 32 KB for agile visual demonstrations
        sync_wal: bool = True,
        l0_compaction_threshold: int = 3,
        event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.memtable_threshold_bytes = memtable_threshold_bytes
        self.sync_wal = sync_wal
        self.l0_compaction_threshold = l0_compaction_threshold
        self.event_callback = event_callback

        self._lock = threading.RLock()

        # In-memory tables
        self.active_memtable: MemTable = MemTable(
            threshold_bytes=self.memtable_threshold_bytes,
            memtable_id="active",
        )
        self.frozen_memtable: Optional[MemTable] = None

        # Write-Ahead Log
        self._current_wal_id = uuid.uuid4().hex[:8]
        self.wal: WriteAheadLog = WriteAheadLog(
            self.data_dir / f"wal_{self._current_wal_id}.log",
            sync_on_write=self.sync_wal,
        )

        # On-disk SSTables partitioned by level (Level 0, Level 1, Level 2)
        self.levels: Dict[int, List[SSTableReader]] = {0: [], 1: [], 2: []}
        self.compactor = CompactionEngine(self.data_dir)

        # Telemetry metrics
        self.stats_writes = 0
        self.stats_reads = 0
        self.stats_deletes = 0
        self.stats_bloom_hits = 0
        self.stats_bloom_misses = 0

        # Discover existing SSTables on disk on startup
        self._load_existing_sstables()

    def _emit(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emits an event to registered callbacks (e.g. WebSocket streamer)."""
        if self.event_callback:
            try:
                self.event_callback(event_type, data)
            except Exception:
                pass

    def _load_existing_sstables(self) -> None:
        """Discovers and opens all existing .sst files in data_dir."""
        for level in range(3):
            self.levels[level] = []

        sst_files = sorted(self.data_dir.glob("sstable_L*.sst"))
        for f in sst_files:
            try:
                # Filename pattern: sstable_L{level}_{id}.sst
                parts = f.stem.split("_")
                lvl = int(parts[1][1:]) if len(parts) >= 2 and parts[1].startswith("L") else 0
                if lvl not in self.levels:
                    self.levels[lvl] = []
                reader = SSTableReader(f, level=lvl)
                self.levels[lvl].append(reader)
            except Exception as e:
                print(f"[Warning] Failed loading SSTable {f.name}: {e}")

    # ==================== Core KV Operations ====================

    def put(self, key: str | bytes, value: str | bytes) -> Record:
        """Stores a key-value pair in the storage engine."""
        k_bytes = key.encode("utf-8") if isinstance(key, str) else key
        v_bytes = value.encode("utf-8") if isinstance(value, str) else value

        record = Record(key=k_bytes, value=v_bytes)

        with self._lock:
            # 1. Append to Write-Ahead Log
            self.wal.append(record)

            # 2. Insert into in-memory active MemTable
            is_update, should_flush = self.active_memtable.put(record)
            self.stats_writes += 1

            self._emit("write", {
                "key": record.key_str,
                "value": record.value_str,
                "timestamp": record.timestamp,
                "is_tombstone": False,
                "wal_size": self.wal.file_size,
                "memtable_bytes": self.active_memtable.estimated_bytes,
                "memtable_count": self.active_memtable.count,
                "should_flush": should_flush,
            })

            # 3. Check if active MemTable exceeded memory threshold
            if should_flush:
                self.flush()

        return record

    def delete(self, key: str | bytes) -> Record:
        """Appends a deletion tombstone for key."""
        k_bytes = key.encode("utf-8") if isinstance(key, str) else key
        tombstone_record = Record(key=k_bytes, value=b"", is_tombstone=True)

        with self._lock:
            # 1. Append tombstone to WAL
            self.wal.append(tombstone_record)

            # 2. Insert tombstone into active MemTable
            is_update, should_flush = self.active_memtable.put(tombstone_record)
            self.stats_deletes += 1

            self._emit("delete", {
                "key": tombstone_record.key_str,
                "timestamp": tombstone_record.timestamp,
                "is_tombstone": True,
                "wal_size": self.wal.file_size,
                "memtable_bytes": self.active_memtable.estimated_bytes,
                "should_flush": should_flush,
            })

            if should_flush:
                self.flush()

        return tombstone_record

    def get(self, key: str | bytes) -> Optional[Record]:
        """Retrieves the newest record for key, returning None if absent or deleted."""
        trace = self.trace_get(key)
        if not trace.found or trace.is_tombstone:
            return None
        return Record(
            key=key.encode("utf-8") if isinstance(key, str) else key,
            value=trace.value.encode("utf-8") if trace.value else b"",
            is_tombstone=trace.is_tombstone,
        )

    def trace_get(self, key: str | bytes) -> TraceResult:
        """Executes a GET query with full visual inspection of every layer checked."""
        k_bytes = key.encode("utf-8") if isinstance(key, str) else key
        k_str = k_bytes.decode("utf-8", errors="replace")
        start_time = time.time()
        steps: List[TraceStep] = []

        with self._lock:
            self.stats_reads += 1

            # 1. Check Active MemTable
            rec = self.active_memtable.get(k_bytes)
            if rec is not None:
                steps.append(TraceStep(
                    layer="active_memtable",
                    target="Active MemTable (RAM)",
                    action="Busca na SkipList",
                    hit=True,
                    detail=f"Encontrado na MemTable Ativa (Timestamp {rec.timestamp})",
                ))
                duration = round((time.time() - start_time) * 1000, 3)
                return TraceResult(
                    key=k_str,
                    found=not rec.is_tombstone,
                    value=rec.value_str if not rec.is_tombstone else None,
                    is_tombstone=rec.is_tombstone,
                    steps=steps,
                    duration_ms=duration,
                )

            steps.append(TraceStep(
                layer="active_memtable",
                target="Active MemTable (RAM)",
                action="Busca na SkipList",
                hit=False,
                detail="Não encontrado no buffer ativo da RAM",
            ))

            # 2. Check Frozen MemTable (if currently flushing)
            if self.frozen_memtable is not None:
                rec = self.frozen_memtable.get(k_bytes)
                if rec is not None:
                    steps.append(TraceStep(
                        layer="frozen_memtable",
                        target="Immutable MemTable (RAM)",
                        action="Busca na SkipList",
                        hit=True,
                        detail="Encontrado na MemTable congelada aguardando flush",
                    ))
                    duration = round((time.time() - start_time) * 1000, 3)
                    return TraceResult(
                        key=k_str,
                        found=not rec.is_tombstone,
                        value=rec.value_str if not rec.is_tombstone else None,
                        is_tombstone=rec.is_tombstone,
                        steps=steps,
                        duration_ms=duration,
                    )

                steps.append(TraceStep(
                    layer="frozen_memtable",
                    target="Immutable MemTable (RAM)",
                    action="Busca na SkipList",
                    hit=False,
                    detail="Não encontrado no buffer congelado",
                ))

            # 3. Check Level 0 SSTables (newest to oldest)
            # Level 0 SSTables can have overlapping key ranges
            for reader in reversed(self.levels.get(0, [])):
                rec, telemetry = reader.get(k_bytes)

                if telemetry.get("disk_read_avoided"):
                    self.stats_bloom_misses += 1
                    steps.append(TraceStep(
                        layer="sstable_bloom",
                        target=f"SSTable L0 ({reader.file_id})",
                        action="Teste de Bits no Filtro de Bloom",
                        hit=False,
                        disk_read_avoided=True,
                        detail="Filtro de Bloom retornou NEGATIVO. Leitura do disco evitada 100%!",
                    ))
                    continue

                self.stats_bloom_hits += 1
                if rec is not None:
                    steps.append(TraceStep(
                        layer="sstable_data",
                        target=f"SSTable L0 ({reader.file_id})",
                        action="Índice Esparso + Seek no Bloco de Dados",
                        hit=True,
                        detail=f"Registro encontrado no Bloco de Dados! ({telemetry['records_scanned']} registros varridos)",
                    ))
                    duration = round((time.time() - start_time) * 1000, 3)
                    return TraceResult(
                        key=k_str,
                        found=not rec.is_tombstone,
                        value=rec.value_str if not rec.is_tombstone else None,
                        is_tombstone=rec.is_tombstone,
                        steps=steps,
                        duration_ms=duration,
                    )

                steps.append(TraceStep(
                    layer="sstable_data",
                    target=f"SSTable L0 ({reader.file_id})",
                    action="Índice Esparso + Seek no Bloco de Dados",
                    hit=False,
                    detail="Filtro de Bloom positivo (possível falso positivo), mas chave ausente no disco",
                ))

            # 4. Check Level 1 and Level 2 SSTables (non-overlapping ranges)
            for lvl in [1, 2]:
                for reader in self.levels.get(lvl, []):
                    # Check if key is within [min_key, max_key] range
                    if reader.min_key and reader.max_key:
                        if not (reader.min_key <= k_str <= reader.max_key):
                            continue

                    rec, telemetry = reader.get(k_bytes)
                    if telemetry.get("disk_read_avoided"):
                        self.stats_bloom_misses += 1
                        steps.append(TraceStep(
                            layer="sstable_bloom",
                            target=f"SSTable L{lvl} ({reader.file_id})",
                            action="Teste de Bits no Filtro de Bloom",
                            hit=False,
                            disk_read_avoided=True,
                            detail="Filtro de Bloom retornou NEGATIVO. Leitura do disco evitada 100%!",
                        ))
                        continue

                    self.stats_bloom_hits += 1
                    if rec is not None:
                        steps.append(TraceStep(
                            layer="sstable_data",
                            target=f"SSTable L{lvl} ({reader.file_id})",
                            action="Índice Esparso + Seek no Bloco de Dados",
                            hit=True,
                            detail=f"Registro encontrado no Bloco de Dados da L{lvl}!",
                        ))
                        duration = round((time.time() - start_time) * 1000, 3)
                        return TraceResult(
                            key=k_str,
                            found=not rec.is_tombstone,
                            value=rec.value_str if not rec.is_tombstone else None,
                            is_tombstone=rec.is_tombstone,
                            steps=steps,
                            duration_ms=duration,
                        )

            # Not found in any layer
            duration = round((time.time() - start_time) * 1000, 3)
            return TraceResult(
                key=k_str,
                found=False,
                value=None,
                is_tombstone=False,
                steps=steps,
                duration_ms=duration,
            )

    def scan(
        self,
        start_key: Optional[str | bytes] = None,
        end_key: Optional[str | bytes] = None,
        limit: int = 100,
    ) -> List[Record]:
        """Scans records in sorted key range, merging memory and all SSTable layers."""
        start_b = start_key.encode("utf-8") if isinstance(start_key, str) else start_key
        end_b = end_key.encode("utf-8") if isinstance(end_key, str) else end_key

        with self._lock:
            # Gather all candidate records across all layers
            all_records: List[Record] = []

            # 1. MemTable active
            all_records.extend(self.active_memtable.scan(start_b, end_b))

            # 2. MemTable frozen
            if self.frozen_memtable:
                all_records.extend(self.frozen_memtable.scan(start_b, end_b))

            # 3. All SSTables
            for lvl_readers in self.levels.values():
                for r in lvl_readers:
                    all_records.extend(list(r.scan(start_b, end_b)))

            # Sort by (key ASC, timestamp DESC) to deduplicate
            all_records.sort(key=lambda r: (r.key, -r.timestamp))

            results: List[Record] = []
            last_key: Optional[bytes] = None

            for rec in all_records:
                if rec.key == last_key:
                    continue
                last_key = rec.key
                if not rec.is_tombstone:
                    results.append(rec)
                if len(results) >= limit:
                    break

            return results

    # ==================== Background Operations ====================

    def flush(self) -> Optional[SSTableMeta]:
        """Flushes the active MemTable into a new Level 0 SSTable file on disk."""
        with self._lock:
            if self.active_memtable.count == 0:
                return None

            records = self.active_memtable.to_record_list()
            old_wal = self.wal

            # Freeze active MemTable and rotate WAL immediately
            self.active_memtable.freeze()
            self.frozen_memtable = self.active_memtable

            self._current_wal_id = uuid.uuid4().hex[:8]
            self.active_memtable = MemTable(
                threshold_bytes=self.memtable_threshold_bytes,
                memtable_id=f"mem_{self._current_wal_id}",
            )
            self.wal = WriteAheadLog(
                self.data_dir / f"wal_{self._current_wal_id}.log",
                sync_on_write=self.sync_wal,
            )

            # Write records to new L0 SSTable
            file_uuid = uuid.uuid4().hex[:8]
            sstable_path = self.data_dir / f"sstable_L0_{file_uuid}.sst"
            writer = SSTableWriter(sstable_path)
            meta = writer.write_records(records, level=0)

            # Open reader and append to Level 0
            reader = SSTableReader(sstable_path, level=0)
            self.levels[0].append(reader)

            # Release frozen MemTable and discard old WAL file safely
            self.frozen_memtable = None
            old_wal.delete()

            self._emit("flush", {
                "sstable_id": meta.file_id,
                "file_size": meta.file_size,
                "record_count": meta.record_count,
                "min_key": meta.min_key,
                "max_key": meta.max_key,
                "l0_count": len(self.levels[0]),
            })

            # Check if Level 0 exceeded compaction threshold
            if len(self.levels[0]) >= self.l0_compaction_threshold:
                self.compact(source_level=0)

            return meta

    def compact(self, source_level: int = 0) -> CompactionReport:
        """Executes a compaction cycle from source_level to source_level + 1."""
        target_level = min(source_level + 1, 2)
        is_bottom_level = (target_level == 2)

        with self._lock:
            source_readers = list(self.levels.get(source_level, []))
            target_readers = list(self.levels.get(target_level, []))

            if not source_readers:
                return CompactionReport(
                    source_level=source_level,
                    target_level=target_level,
                    input_files=[],
                    output_files=[],
                    records_merged=0,
                    tombstones_purged=0,
                    bytes_before=0,
                    bytes_after=0,
                    duration_ms=0,
                )

            # Execute k-way merge sort
            new_metas, report = self.compactor.compact_levels(
                source_readers=source_readers,
                target_readers=target_readers,
                source_level=source_level,
                target_level=target_level,
                is_bottom_level=is_bottom_level,
            )

            # Update level readers in memory
            self.levels[source_level] = []
            new_readers = [SSTableReader(Path(m.file_path), level=target_level) for m in new_metas]
            self.levels[target_level] = new_readers

            # Remove old SSTable files from disk
            for r in source_readers + target_readers:
                try:
                    if r.filepath.exists():
                        r.filepath.unlink()
                except OSError:
                    pass

            self._emit("compaction", report.to_dict())
            return report

    # ==================== Chaos & Crash Recovery ====================

    def simulate_crash(self) -> Dict[str, Any]:
        """Simulates an abrupt process crash by wiping RAM without flushing."""
        with self._lock:
            lost_active_count = self.active_memtable.count
            lost_frozen_count = self.frozen_memtable.count if self.frozen_memtable else 0

            # Wipe memory buffers immediately
            self.active_memtable = MemTable(
                threshold_bytes=self.memtable_threshold_bytes,
                memtable_id="crashed_empty",
            )
            self.frozen_memtable = None

            report = {
                "status": "CRASHED",
                "message": "RAM cleared abruptly! Unflushed memory lost, WAL remains on disk for recovery.",
                "lost_active_records": lost_active_count,
                "lost_frozen_records": lost_frozen_count,
            }
            self._emit("crash", report)
            return report

    def recover(self) -> RecoveryReport:
        """Replays all existing WAL files and restores consistent in-memory state."""
        start_time = time.time()
        with self._lock:
            wal_files = sorted(self.data_dir.glob("wal_*.log"))
            all_recovered_records: List[Record] = []
            total_corruptions = 0
            total_truncated_bytes = 0

            for wf in wal_files:
                records, corrupt_bytes = WriteAheadLog.read_all(wf, truncate_corrupted_tail=True)
                all_recovered_records.extend(records)
                if corrupt_bytes > 0:
                    total_corruptions += 1
                    total_truncated_bytes += corrupt_bytes

            # Rebuild Active MemTable from replayed records
            self.active_memtable = MemTable(
                threshold_bytes=self.memtable_threshold_bytes,
                memtable_id="recovered",
            )
            for rec in all_recovered_records:
                self.active_memtable.put(rec)

            duration = round((time.time() - start_time) * 1000, 2)
            report = RecoveryReport(
                wal_files_scanned=len(wal_files),
                records_recovered=len(all_recovered_records),
                corruptions_encountered=total_corruptions,
                truncated_tail_bytes=total_truncated_bytes,
                duration_ms=duration,
            )
            self._emit("recover", report.to_dict())
            return report

    # ==================== State & Inspection ====================

    def get_state(self) -> Dict[str, Any]:
        """Returns a snapshot of the entire storage engine for dashboard telemetry."""
        with self._lock:
            l0_sstables = [r.inspect_layout() for r in self.levels.get(0, [])]
            l1_sstables = [r.inspect_layout() for r in self.levels.get(1, [])]
            l2_sstables = [r.inspect_layout() for r in self.levels.get(2, [])]

            total_disk_bytes = sum(
                r.file_size
                for readers in self.levels.values()
                for r in readers
            ) + self.wal.file_size

            return {
                "active_memtable": self.active_memtable.export_state(),
                "frozen_memtable": self.frozen_memtable.export_state() if self.frozen_memtable else None,
                "wal": {
                    "filename": self.wal.filepath.name,
                    "file_size": self.wal.file_size,
                    "records_count": self.wal.records_count,
                    "sync_on_write": self.sync_wal,
                },
                "levels": {
                    "0": l0_sstables,
                    "1": l1_sstables,
                    "2": l2_sstables,
                },
                "metrics": {
                    "writes": self.stats_writes,
                    "reads": self.stats_reads,
                    "deletes": self.stats_deletes,
                    "bloom_hits": self.stats_bloom_hits,
                    "bloom_misses": self.stats_bloom_misses,
                    "total_disk_bytes": total_disk_bytes,
                    "l0_count": len(self.levels.get(0, [])),
                    "l1_count": len(self.levels.get(1, [])),
                    "l2_count": len(self.levels.get(2, [])),
                },
            }

    def inspect_raw_file(self, filename: str) -> Dict[str, Any]:
        """Loads and formats a file on disk into annotated hex dump format."""
        target_path = self.data_dir / filename
        if not target_path.exists():
            raise FileNotFoundError(f"File {filename} not found in storage directory")

        with open(target_path, "rb") as f:
            raw_data = f.read(16384)  # Read up to first 16KB for hex dump

        file_size = target_path.stat().st_size
        lines = []
        for i in range(0, len(raw_data), 16):
            chunk = raw_data[i : i + 16]
            hex_part = " ".join(f"{b:02x}" for b in chunk)
            ascii_part = "".join(chr(b) if 32 <= b <= 126 else "." for b in chunk)
            lines.append({
                "offset": f"{i:08x}",
                "hex": hex_part,
                "ascii": ascii_part,
            })

        # Layout metadata if it is an SSTable
        layout_meta = None
        for readers in self.levels.values():
            for r in readers:
                if r.filepath.name == filename:
                    layout_meta = r.inspect_layout()
                    break

        return {
            "filename": filename,
            "file_size": file_size,
            "bytes_inspected": len(raw_data),
            "hex_lines": lines,
            "layout": layout_meta,
        }

    def close(self) -> None:
        """Flushes and closes all open file handles."""
        with self._lock:
            if self.wal:
                self.wal.close()

