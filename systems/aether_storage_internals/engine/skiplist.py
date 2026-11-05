"""SkipList data structure providing O(log n) ordered in-memory lookups and scans."""

from __future__ import annotations

import random
from typing import Any, Dict, Iterator, List, Optional, Tuple

from .types import Record


class SkipNode:
    """A node inside the SkipList with variable forward pointer towers."""

    __slots__ = ("key", "record", "forward")

    def __init__(self, key: bytes, record: Optional[Record], level: int):
        self.key = key
        self.record = record
        self.forward: List[Optional[SkipNode]] = [None] * level

    @property
    def level(self) -> int:
        return len(self.forward)


class SkipList:
    """A probabilistic balanced linked-list structure with O(log n) performance.

    Used by LevelDB and RocksDB as the standard MemTable backing structure.
    """

    def __init__(self, max_level: int = 16, p: float = 0.5):
        self.max_level = max_level
        self.p = p
        self.level = 1
        # Head node with empty sentinel key
        self.head = SkipNode(b"", None, self.max_level)
        self._size = 0
        self._estimated_bytes = 0

    @property
    def estimated_bytes(self) -> int:
        return self._estimated_bytes

    def __len__(self) -> int:
        return self._size

    def _random_level(self) -> int:
        lvl = 1
        while random.random() < self.p and lvl < self.max_level:
            lvl += 1
        return lvl

    def insert(self, record: Record) -> Tuple[bool, int]:
        """Inserts or updates a record.

        Returns (is_update, delta_bytes).
        """
        update: List[SkipNode] = [self.head] * self.max_level
        curr = self.head

        # Traverse downwards from highest active level to level 0
        for i in range(self.level - 1, -1, -1):
            while curr.forward[i] and curr.forward[i].key < record.key:
                curr = curr.forward[i]
            update[i] = curr

        curr = curr.forward[0]

        # Key already exists: update record in place
        if curr and curr.key == record.key:
            old_size = curr.record.encoded_size() if curr.record else 0
            new_size = record.encoded_size()
            curr.record = record
            delta = new_size - old_size
            self._estimated_bytes += delta
            return True, delta

        # Key does not exist: create a new node
        new_level = self._random_level()
        if new_level > self.level:
            for i in range(self.level, new_level):
                update[i] = self.head
            self.level = new_level

        new_node = SkipNode(record.key, record, new_level)
        for i in range(new_level):
            new_node.forward[i] = update[i].forward[i]
            update[i].forward[i] = new_node

        self._size += 1
        # Overhead: record size + pointers memory footprint estimation
        node_bytes = record.encoded_size() + (new_level * 8) + 32
        self._estimated_bytes += node_bytes
        return False, node_bytes

    def get(self, key: bytes) -> Optional[Record]:
        """Finds a record by key in O(log n) time."""
        curr = self.head
        for i in range(self.level - 1, -1, -1):
            while curr.forward[i] and curr.forward[i].key < key:
                curr = curr.forward[i]

        curr = curr.forward[0]
        if curr and curr.key == key:
            return curr.record
        return None

    def scan(
        self,
        start_key: Optional[bytes] = None,
        end_key: Optional[bytes] = None,
        limit: Optional[int] = None,
    ) -> List[Record]:
        """Iterates over keys in lexicographical range [start_key, end_key)."""
        results: List[Record] = []
        curr = self.head

        if start_key is not None:
            for i in range(self.level - 1, -1, -1):
                while curr.forward[i] and curr.forward[i].key < start_key:
                    curr = curr.forward[i]
            curr = curr.forward[0]
        else:
            curr = curr.forward[0]

        while curr is not None:
            if end_key is not None and curr.key >= end_key:
                break
            if curr.record:
                results.append(curr.record)
            if limit is not None and len(results) >= limit:
                break
            curr = curr.forward[0]

        return results

    def __iter__(self) -> Iterator[Record]:
        curr = self.head.forward[0]
        while curr is not None:
            if curr.record:
                yield curr.record
            curr = curr.forward[0]

    def export_graph(self) -> Dict[str, Any]:
        """Exports a detailed topological representation for visual rendering."""
        nodes: List[Dict[str, Any]] = []
        curr = self.head.forward[0]
        idx = 0

        while curr is not None:
            links = []
            for lvl in range(curr.level):
                target_key = curr.forward[lvl].key.decode("utf-8", errors="replace") if curr.forward[lvl] else None
                links.append(target_key)

            nodes.append({
                "index": idx,
                "key": curr.key.decode("utf-8", errors="replace"),
                "value": curr.record.value_str if curr.record else "",
                "is_tombstone": curr.record.is_tombstone if curr.record else False,
                "timestamp": curr.record.timestamp if curr.record else 0,
                "level": curr.level,
                "links": links,
            })
            idx += 1
            curr = curr.forward[0]

        return {
            "total_nodes": self._size,
            "max_level": self.max_level,
            "active_level": self.level,
            "estimated_bytes": self._estimated_bytes,
            "nodes": nodes,
        }
