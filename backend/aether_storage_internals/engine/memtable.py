"""MemTable in-memory buffer managing the active and immutable SkipList."""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from .skiplist import SkipList
from .types import Record


class MemTable:
    """In-memory ordered buffer that absorbs writes before flushing to disk."""

    def __init__(self, threshold_bytes: int = 65536, memtable_id: Optional[str] = None):
        self.id = memtable_id or f"mem_{uuid.uuid4().hex[:8]}"
        self.threshold_bytes = threshold_bytes
        self.skiplist = SkipList()
        self.created_at = time.time()
        self.is_frozen = False

    @property
    def estimated_bytes(self) -> int:
        return self.skiplist.estimated_bytes

    @property
    def count(self) -> int:
        return len(self.skiplist)

    def put(self, record: Record) -> Tuple[bool, bool]:
        """Inserts a record into the MemTable.

        Returns (is_update, should_flush).
        """
        if self.is_frozen:
            raise RuntimeError("Cannot write to an immutable (frozen) MemTable")

        is_update, _ = self.skiplist.insert(record)
        should_flush = self.skiplist.estimated_bytes >= self.threshold_bytes
        return is_update, should_flush

    def get(self, key: bytes) -> Optional[Record]:
        """Looks up a record in the MemTable."""
        return self.skiplist.get(key)

    def scan(
        self,
        start_key: Optional[bytes] = None,
        end_key: Optional[bytes] = None,
        limit: Optional[int] = None,
    ) -> List[Record]:
        """Scans records in range [start_key, end_key)."""
        return self.skiplist.scan(start_key, end_key, limit)

    def freeze(self) -> None:
        """Freezes this MemTable, making it immutable and ready for disk flushing."""
        self.is_frozen = True

    def to_record_list(self) -> List[Record]:
        """Exports all records in strictly sorted order."""
        return list(self.skiplist)

    def export_state(self) -> Dict[str, Any]:
        """Exports metadata and topological node information."""
        return {
            "id": self.id,
            "created_at": self.created_at,
            "is_frozen": self.is_frozen,
            "estimated_bytes": self.estimated_bytes,
            "threshold_bytes": self.threshold_bytes,
            "capacity_pct": min(100.0, round((self.estimated_bytes / max(1, self.threshold_bytes)) * 100, 1)),
            "count": self.count,
            "graph": self.skiplist.export_graph(),
        }
