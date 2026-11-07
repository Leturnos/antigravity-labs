"""1-based Raft log view over the persistent entry list."""

from __future__ import annotations

from typing import Any

from .messages import LogEntry
from .persistent_state import PersistentState


class RaftLog:
    def __init__(self, state: PersistentState) -> None:
        self._state = state

    @property
    def last_index(self) -> int:
        return len(self._state.entries)

    @property
    def last_term(self) -> int:
        return self._state.entries[-1].term if self._state.entries else 0

    def term_at(self, index: int) -> int | None:
        """Term of the entry at ``index``; 0 for the sentinel index 0, None if absent."""
        if index == 0:
            return 0
        if 1 <= index <= self.last_index:
            return self._state.entries[index - 1].term
        return None

    def entry_at(self, index: int) -> LogEntry:
        if not 1 <= index <= self.last_index:
            raise IndexError(f"log index {index} out of range 1..{self.last_index}")
        return self._state.entries[index - 1]

    def slice(self, start: int, limit: int) -> tuple[LogEntry, ...]:
        """Up to ``limit`` entries beginning at ``start``."""
        return tuple(self._state.entries[start - 1 : start - 1 + limit])

    def append_command(self, term: int, command: Any) -> LogEntry:
        entry = LogEntry(term=term, index=self.last_index + 1, command=command)
        self._state.entries.append(entry)
        return entry

    def append(self, entry: LogEntry) -> None:
        if entry.index != self.last_index + 1:
            raise ValueError(f"non-contiguous append: got {entry.index}, expected {self.last_index + 1}")
        self._state.entries.append(entry)

    def truncate_from(self, index: int) -> None:
        """Delete the entry at ``index`` and everything after it."""
        del self._state.entries[index - 1 :]

    def is_up_to_date(self, last_index: int, last_term: int) -> bool:
        """Election restriction (§5.4.1): is a candidate's log at least as current as ours?"""
        if last_term != self.last_term:
            return last_term > self.last_term
        return last_index >= self.last_index
