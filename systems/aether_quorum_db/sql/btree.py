"""In-memory B+Tree implementation with linked leaf nodes for range scans."""

from __future__ import annotations

import bisect
from collections.abc import Iterator
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


class _BPlusNode(Generic[K, V]):
    """Base node for B+Tree."""

    def __init__(self, is_leaf: bool) -> None:
        self.is_leaf = is_leaf
        self.keys: list[K] = []


class _InternalNode(_BPlusNode[K, V]):
    """Internal routing node containing keys and child node pointers."""

    def __init__(self) -> None:
        super().__init__(is_leaf=False)
        self.children: list[_BPlusNode[K, V]] = []


class _LeafNode(_BPlusNode[K, V]):
    """Leaf node containing keys, values, and pointer to next leaf."""

    def __init__(self) -> None:
        super().__init__(is_leaf=True)
        self.values: list[V] = []
        self.next_leaf: _LeafNode[K, V] | None = None
        self.prev_leaf: _LeafNode[K, V] | None = None


class BPlusTree(Generic[K, V]):
    """Ordered key-value map implemented as a balanced in-memory B+Tree."""

    def __init__(self, degree: int = 16) -> None:
        if degree < 3:
            raise ValueError(f"B+Tree degree must be at least 3, got {degree}")
        self.degree = degree
        self.max_keys = degree - 1
        self.min_keys = (degree - 1) // 2

        self._root: _BPlusNode[K, V] = _LeafNode()
        self._first_leaf: _LeafNode[K, V] = self._root  # type: ignore[assignment]
        self._size = 0

    def __len__(self) -> int:
        return self._size

    def __bool__(self) -> bool:
        return self._size > 0

    # ---- Point Lookup ----------------------------------------------------

    def get(self, key: K, default: V | None = None) -> V | None:
        """Lookup key in O(log N). Returns value or default."""
        leaf = self._find_leaf(key)
        idx = bisect.bisect_left(leaf.keys, key)
        if idx < len(leaf.keys) and leaf.keys[idx] == key:
            return leaf.values[idx]
        return default

    def __getitem__(self, key: K) -> V:
        val = self.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def __contains__(self, key: K) -> bool:
        leaf = self._find_leaf(key)
        idx = bisect.bisect_left(leaf.keys, key)
        return idx < len(leaf.keys) and leaf.keys[idx] == key

    # ---- Insertion -------------------------------------------------------

    def insert(self, key: K, value: V) -> None:
        """Insert or update a key-value pair in O(log N)."""
        leaf, path = self._find_leaf_with_path(key)
        idx = bisect.bisect_left(leaf.keys, key)

        # Update existing key
        if idx < len(leaf.keys) and leaf.keys[idx] == key:
            leaf.values[idx] = value
            return

        # Insert new key into leaf
        leaf.keys.insert(idx, key)
        leaf.values.insert(idx, value)
        self._size += 1

        # Split leaf if overflow
        if len(leaf.keys) > self.max_keys:
            self._split_leaf(leaf, path)

    def __setitem__(self, key: K, value: V) -> None:
        self.insert(key, value)

    # ---- Deletion --------------------------------------------------------

    def delete(self, key: K) -> bool:
        """Remove key from the tree. Returns True if removed, False if not found."""
        leaf = self._find_leaf(key)
        idx = bisect.bisect_left(leaf.keys, key)
        if idx >= len(leaf.keys) or leaf.keys[idx] != key:
            return False

        leaf.keys.pop(idx)
        leaf.values.pop(idx)
        self._size -= 1
        return True

    # ---- Range Scans & Iteration -----------------------------------------

    def items(
        self,
        low: K | None = None,
        high: K | None = None,
        include_low: bool = True,
        include_high: bool = True,
    ) -> Iterator[tuple[K, V]]:
        """Scan keys within [low, high] in O(log N + K)."""
        if low is None:
            curr: _LeafNode[K, V] | None = self._first_leaf
            start_idx = 0
        else:
            curr = self._find_leaf(low)
            start_idx = bisect.bisect_left(curr.keys, low) if include_low else bisect.bisect_right(curr.keys, low)

        while curr is not None:
            for i in range(start_idx, len(curr.keys)):
                k = curr.keys[i]
                if high is not None:
                    if include_high and k > high:
                        return
                    if not include_high and k >= high:
                        return
                yield (k, curr.values[i])
            curr = curr.next_leaf
            start_idx = 0

    def keys(self) -> Iterator[K]:
        for k, _ in self.items():  # noqa: PERF102
            yield k

    def values(self) -> Iterator[V]:
        for _, v in self.items():  # noqa: PERF102
            yield v

    def __iter__(self) -> Iterator[K]:
        return self.keys()

    # ---- Internal Traversal & Splitting ----------------------------------

    def _find_leaf(self, key: K) -> _LeafNode[K, V]:
        leaf, _ = self._find_leaf_with_path(key)
        return leaf

    def _find_leaf_with_path(self, key: K) -> tuple[_LeafNode[K, V], list[_InternalNode[K, V]]]:
        curr = self._root
        path: list[_InternalNode[K, V]] = []
        while not curr.is_leaf:
            internal: _InternalNode[K, V] = curr  # type: ignore[assignment]
            path.append(internal)
            idx = bisect.bisect_right(internal.keys, key)
            curr = internal.children[idx]
        return curr, path  # type: ignore[return-value]

    def _split_leaf(self, leaf: _LeafNode[K, V], path: list[_InternalNode[K, V]]) -> None:
        mid = len(leaf.keys) // 2

        new_leaf: _LeafNode[K, V] = _LeafNode()
        new_leaf.keys = leaf.keys[mid:]
        new_leaf.values = leaf.values[mid:]
        leaf.keys = leaf.keys[:mid]
        leaf.values = leaf.values[:mid]

        new_leaf.next_leaf = leaf.next_leaf
        new_leaf.prev_leaf = leaf
        if leaf.next_leaf is not None:
            leaf.next_leaf.prev_leaf = new_leaf
        leaf.next_leaf = new_leaf

        promote_key = new_leaf.keys[0]

        if not path:
            new_root = _InternalNode[K, V]()
            new_root.keys = [promote_key]
            new_root.children = [leaf, new_leaf]
            self._root = new_root
        else:
            parent = path.pop()
            self._insert_into_internal(parent, promote_key, new_leaf, path)

    def _split_internal(
        self,
        node: _InternalNode[K, V],
        path: list[_InternalNode[K, V]],
    ) -> None:
        mid = len(node.keys) // 2
        promote_key = node.keys[mid]

        new_internal: _InternalNode[K, V] = _InternalNode()
        new_internal.keys = node.keys[mid + 1 :]
        new_internal.children = node.children[mid + 1 :]
        node.keys = node.keys[:mid]
        node.children = node.children[: mid + 1]

        if not path:
            new_root = _InternalNode[K, V]()
            new_root.keys = [promote_key]
            new_root.children = [node, new_internal]
            self._root = new_root
        else:
            parent = path.pop()
            self._insert_into_internal(parent, promote_key, new_internal, path)

    def _insert_into_internal(
        self,
        parent: _InternalNode[K, V],
        key: K,
        child: _BPlusNode[K, V],
        path: list[_InternalNode[K, V]],
    ) -> None:
        idx = bisect.bisect_right(parent.keys, key)
        parent.keys.insert(idx, key)
        parent.children.insert(idx + 1, child)

        if len(parent.keys) > self.max_keys:
            self._split_internal(parent, path)
