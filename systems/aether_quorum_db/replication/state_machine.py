"""State machine abstractions and reference Key-Value state machine."""

from __future__ import annotations

import json
from typing import Any, Protocol


class StateMachine(Protocol):
    """Deterministic state machine driven by committed Raft log commands."""

    def apply(self, command: Any) -> Any:
        """Apply a single committed command and return the result."""
        ...

    def create_snapshot(self) -> bytes:
        """Serialize complete state into raw bytes for log compaction."""
        ...

    def restore_snapshot(self, data: bytes) -> None:
        """Restore state completely from snapshot bytes."""
        ...


class KVStateMachine:
    """In-memory key-value state machine supporting get, put, and delete commands."""

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    def get(self, key: str) -> Any:
        return self._data.get(key)

    def apply(self, command: Any) -> Any:
        if not isinstance(command, (list, tuple)) or not command:
            raise ValueError(f"invalid state machine command: {command!r}")

        op = command[0]
        if op == "put":
            _, key, value = command
            self._data[str(key)] = value
            return value
        elif op == "delete":
            _, key = command
            return self._data.pop(str(key), None)
        elif op == "get":
            _, key = command
            return self._data.get(str(key))
        else:
            raise ValueError(f"unknown state machine operation: {op!r}")

    def create_snapshot(self) -> bytes:
        return json.dumps(self._data, sort_keys=True).encode("utf-8")

    def restore_snapshot(self, data: bytes) -> None:
        self._data = json.loads(data.decode("utf-8"))

    @property
    def data(self) -> dict[str, Any]:
        return dict(self._data)
