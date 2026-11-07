"""SQL State Machine driving Database execution from committed Raft log commands."""

from __future__ import annotations

import hashlib
from typing import Any

from ..sql.ast import Select
from ..sql.database import Database, ResultSet
from ..sql.errors import SqlError
from ..sql.parser import Parser


class NonDeterministicError(SqlError):
    """Raised when a proposed statement contains non-deterministic functions."""


class SqlStateMachine:
    """State machine that executes committed SQL statements against a B+Tree Database."""

    def __init__(self) -> None:
        self.db = Database()

    def apply(self, command: Any) -> Any:
        """Apply a committed SQL statement string or AST to the database."""
        if not isinstance(command, str):
            raise TypeError(f"Expected SQL string command, got: {command!r}")

        # Validate non-deterministic functions (e.g. RANDOM(), NOW())
        upper_cmd = command.upper()
        if "RANDOM()" in upper_cmd or "NOW()" in upper_cmd or "UUID()" in upper_cmd:
            raise NonDeterministicError(
                "Non-deterministic functions are prohibited in statement-based replication"
            )

        res = self.db.execute(command)
        return res

    def query(self, sql: str) -> ResultSet:
        """Execute a read-only SELECT query directly on the local database."""
        stmt = Parser.parse_sql(sql)
        if not isinstance(stmt, Select):
            raise SqlError("Only SELECT queries can be executed via query()")
        return self.db.execute(stmt)

    def create_snapshot(self) -> bytes:
        """Serialize complete database state (catalog + B+Trees) to bytes."""
        return self.db.create_snapshot()

    def restore_snapshot(self, data: bytes) -> None:
        """Restore database state completely from snapshot bytes."""
        self.db.restore_snapshot(data)

    def state_checksum(self) -> str:
        """Compute deterministic SHA-256 hash of the entire database state."""
        snapshot = self.create_snapshot()
        return hashlib.sha256(snapshot).hexdigest()
