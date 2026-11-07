"""1-based Raft log view over the persistent entry list with compaction support."""

from __future__ import annotations

from typing import Any

from .messages import LogEntry
from .persistent_state import PersistentState


class RaftLog:
    def __init__(self, state: PersistentState) -> None:
        self._state = state

    @property
    def last_included_index(self) -> int:
        return self._state.last_included_index

    @property
    def last_included_term(self) -> int:
        return self._state.last_included_term

    @property
    def snapshot_data(self) -> bytes:
        return self._state.snapshot_data

    @property
    def last_index(self) -> int:
        if self._state.entries:
            return self._state.entries[-1].index
        return self._state.last_included_index

    @property
    def last_term(self) -> int:
        if self._state.entries:
            return self._state.entries[-1].term
        return self._state.last_included_term

    def term_at(self, index: int) -> int | None:
        """Term of entry at ``index``; 0 for sentinel index 0, None if out of range or compacted."""
        if index == 0:
            return 0
        if index == self._state.last_included_index:
            return self._state.last_included_term
        if index < self._state.last_included_index:
            return None
        offset = index - self._state.last_included_index - 1
        if 0 <= offset < len(self._state.entries):
            return self._state.entries[offset].term
        return None

    def entry_at(self, index: int) -> LogEntry:
        if index <= self._state.last_included_index:
            raise IndexError(
                f"log index {index} already compacted into snapshot "
                f"(last_included_index={self._state.last_included_index})"
            )
        offset = index - self._state.last_included_index - 1
        if not 0 <= offset < len(self._state.entries):
            raise IndexError(f"log index {index} out of range")
        return self._state.entries[offset]

    def slice(self, start: int, limit: int) -> tuple[LogEntry, ...]:
        """Up to ``limit`` entries beginning at ``start``."""
        if start <= self._state.last_included_index:
            raise IndexError(
                f"slice start {start} is within compacted snapshot range "
                f"(last_included_index={self._state.last_included_index})"
            )
        offset = start - self._state.last_included_index - 1
        return tuple(self._state.entries[offset : offset + limit])

    def append_command(
        self,
        term: int,
        command: Any,
        client_id: str | None = None,
        sequence_num: int | None = None,
    ) -> LogEntry:
        entry = LogEntry(
            term=term,
            index=self.last_index + 1,
            command=command,
            client_id=client_id,
            sequence_num=sequence_num,
        )
        self._state.entries.append(entry)
        return entry

    def append(self, entry: LogEntry) -> None:
        if entry.index != self.last_index + 1:
            raise ValueError(
                f"non-contiguous append: got {entry.index}, expected {self.last_index + 1}"
            )
        self._state.entries.append(entry)

    def truncate_from(self, index: int) -> None:
        """Delete the entry at ``index`` and everything after it."""
        if index <= self._state.last_included_index:
            raise ValueError(
                f"cannot truncate index {index} within compacted snapshot range "
                f"(last_included_index={self._state.last_included_index})"
            )
        offset = index - self._state.last_included_index - 1
        del self._state.entries[offset:]

    def compact(self, last_included_index: int, last_included_term: int, snapshot_data: bytes) -> None:
        """Discard entries up to and including ``last_included_index``."""
        if last_included_index <= self._state.last_included_index:
            return

        retain_from = last_included_index - self._state.last_included_index
        if retain_from < len(self._state.entries):
            self._state.entries = self._state.entries[retain_from:]
        else:
            self._state.entries = []

        self._state.last_included_index = last_included_index
        self._state.last_included_term = last_included_term
        self._state.snapshot_data = snapshot_data

    def restore_snapshot(
        self,
        last_included_index: int,
        last_included_term: int,
        snapshot_data: bytes,
    ) -> None:
        """Discard entire log or retain entries beyond ``last_included_index`` (§7)."""
        retained: list[LogEntry] = []
        for i, entry in enumerate(self._state.entries):
            if entry.index == last_included_index and entry.term == last_included_term:
                retained = self._state.entries[i + 1 :]
                break

        self._state.entries = retained
        self._state.last_included_index = last_included_index
        self._state.last_included_term = last_included_term
        self._state.snapshot_data = snapshot_data

    def is_up_to_date(self, last_index: int, last_term: int) -> bool:
        """Election restriction (§5.4.1): is a candidate's log at least as current as ours?"""
        if last_term != self.last_term:
            return last_term > self.last_term
        return last_index >= self.last_index
