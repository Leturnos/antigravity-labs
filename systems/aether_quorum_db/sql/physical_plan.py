"""Volcano iterator model physical execution plan operators."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


class PhysicalOperator:
    """Base class for Volcano iterator model execution operators."""

    def open(self) -> None:
        """Initialize the operator and allocate resources."""

    def next(self) -> tuple[Any, ...] | None:
        """Return the next output tuple, or None if the stream has finished."""
        return None

    def close(self) -> None:
        """Release resources and close child operators."""

    def children(self) -> list[PhysicalOperator]:
        return []

    def describe(self) -> str:
        return self.__class__.__name__

    def format_tree(self, indent: int = 0) -> str:
        prefix = "  " * indent
        s = f"{prefix}{self.describe()}"
        for child in self.children():
            s += "\n" + child.format_tree(indent + 1)
        return s

    def execute_all(self) -> list[tuple[Any, ...]]:
        self.open()
        rows: list[tuple[Any, ...]] = []
        try:
            while True:
                row = self.next()
                if row is None:
                    break
                rows.append(row)
        finally:
            self.close()
        return rows


class PhysicalSeqScan(PhysicalOperator):
    """Full table scan using the primary key B+Tree storage."""

    def __init__(self, table_name: str, rows_supplier: Callable[[], list[tuple[Any, ...]]]) -> None:
        self.table_name = table_name
        self.rows_supplier = rows_supplier
        self._iterator: Any | None = None

    def open(self) -> None:
        self._iterator = iter(self.rows_supplier())

    def next(self) -> tuple[Any, ...] | None:
        if self._iterator is None:
            return None
        return next(self._iterator, None)

    def close(self) -> None:
        self._iterator = None

    def describe(self) -> str:
        return f"SeqScan(table={self.table_name})"


class PhysicalIndexScan(PhysicalOperator):
    """Point or range scan using a secondary or primary B+Tree index."""

    def __init__(
        self,
        table_name: str,
        index_name: str,
        rows_supplier: Callable[[], list[tuple[Any, ...]]],
        condition_desc: str = "",
    ) -> None:
        self.table_name = table_name
        self.index_name = index_name
        self.rows_supplier = rows_supplier
        self.condition_desc = condition_desc
        self._iterator: Any | None = None

    def open(self) -> None:
        self._iterator = iter(self.rows_supplier())

    def next(self) -> tuple[Any, ...] | None:
        if self._iterator is None:
            return None
        return next(self._iterator, None)

    def close(self) -> None:
        self._iterator = None

    def describe(self) -> str:
        cond_str = f", {self.condition_desc}" if self.condition_desc else ""
        return f"IndexScan(table={self.table_name}, index={self.index_name}{cond_str})"


class PhysicalFilter(PhysicalOperator):
    """Filters tuples using a boolean predicate predicate_fn(row) -> bool."""

    def __init__(self, child: PhysicalOperator, predicate_fn: Callable[[tuple[Any, ...]], bool], expr_desc: str = "") -> None:
        self.child = child
        self.predicate_fn = predicate_fn
        self.expr_desc = expr_desc

    def children(self) -> list[PhysicalOperator]:
        return [self.child]

    def open(self) -> None:
        self.child.open()

    def next(self) -> tuple[Any, ...] | None:
        while True:
            row = self.child.next()
            if row is None:
                return None
            if self.predicate_fn(row):
                return row

    def close(self) -> None:
        self.child.close()

    def describe(self) -> str:
        return f"Filter(predicate={self.expr_desc})"


class PhysicalProject(PhysicalOperator):
    """Computes projected expressions project_fn(row) -> tuple."""

    def __init__(self, child: PhysicalOperator, project_fn: Callable[[tuple[Any, ...]], tuple[Any, ...]], proj_desc: str = "") -> None:
        self.child = child
        self.project_fn = project_fn
        self.proj_desc = proj_desc

    def children(self) -> list[PhysicalOperator]:
        return [self.child]

    def open(self) -> None:
        self.child.open()

    def next(self) -> tuple[Any, ...] | None:
        row = self.child.next()
        if row is None:
            return None
        return self.project_fn(row)

    def close(self) -> None:
        self.child.close()

    def describe(self) -> str:
        return f"Project({self.proj_desc})"


class PhysicalHashJoin(PhysicalOperator):
    """Equi-join using in-memory hash table built on the right relation."""

    def __init__(
        self,
        left: PhysicalOperator,
        right: PhysicalOperator,
        left_key_fn: Callable[[tuple[Any, ...]], Any],
        right_key_fn: Callable[[tuple[Any, ...]], Any],
        join_desc: str = "",
    ) -> None:
        self.left = left
        self.right = right
        self.left_key_fn = left_key_fn
        self.right_key_fn = right_key_fn
        self.join_desc = join_desc

        self._hash_table: dict[Any, list[tuple[Any, ...]]] = {}
        self._current_left_row: tuple[Any, ...] | None = None
        self._matching_right_rows: list[tuple[Any, ...]] = []
        self._match_idx: int = 0

    def children(self) -> list[PhysicalOperator]:
        return [self.left, self.right]

    def open(self) -> None:
        # Build phase on right input
        self.right.open()
        self._hash_table = {}
        try:
            while True:
                row = self.right.next()
                if row is None:
                    break
                k = self.right_key_fn(row)
                self._hash_table.setdefault(k, []).append(row)
        finally:
            self.right.close()

        # Probe phase on left input
        self.left.open()
        self._current_left_row = None
        self._matching_right_rows = []
        self._match_idx = 0

    def next(self) -> tuple[Any, ...] | None:
        while True:
            # If we have remaining matches for the current left row, yield next
            if self._match_idx < len(self._matching_right_rows):
                r_row = self._matching_right_rows[self._match_idx]
                self._match_idx += 1
                return self._current_left_row + r_row

            # Read next left row
            self._current_left_row = self.left.next()
            if self._current_left_row is None:
                return None

            k = self.left_key_fn(self._current_left_row)
            self._matching_right_rows = self._hash_table.get(k, [])
            self._match_idx = 0

    def close(self) -> None:
        self.left.close()
        self._hash_table.clear()
        self._matching_right_rows = []

    def describe(self) -> str:
        return f"HashJoin({self.join_desc})"


class PhysicalSort(PhysicalOperator):
    """Sorts input rows using sort_key_fn."""

    def __init__(self, child: PhysicalOperator, sort_key_fn: Callable[[tuple[Any, ...]], Any], reverse: bool = False) -> None:
        self.child = child
        self.sort_key_fn = sort_key_fn
        self.reverse = reverse
        self._iterator: Any | None = None

    def children(self) -> list[PhysicalOperator]:
        return [self.child]

    def open(self) -> None:
        rows = self.child.execute_all()
        rows.sort(key=self.sort_key_fn, reverse=self.reverse)
        self._iterator = iter(rows)

    def next(self) -> tuple[Any, ...] | None:
        if self._iterator is None:
            return None
        return next(self._iterator, None)

    def close(self) -> None:
        self.child.close()
        self._iterator = None

    def describe(self) -> str:
        return f"Sort(reverse={self.reverse})"


class PhysicalLimit(PhysicalOperator):
    """Applies LIMIT and OFFSET to the input tuple stream."""

    def __init__(self, child: PhysicalOperator, limit: int | None = None, offset: int | None = None) -> None:
        self.child = child
        self.limit = limit
        self.offset = offset or 0
        self._count = 0

    def children(self) -> list[PhysicalOperator]:
        return [self.child]

    def open(self) -> None:
        self.child.open()
        self._count = 0
        # Discard offset rows
        for _ in range(self.offset):
            if self.child.next() is None:
                break

    def next(self) -> tuple[Any, ...] | None:
        if self.limit is not None and self._count >= self.limit:
            return None
        row = self.child.next()
        if row is not None:
            self._count += 1
        return row

    def close(self) -> None:
        self.child.close()

    def describe(self) -> str:
        return f"Limit(limit={self.limit}, offset={self.offset})"
