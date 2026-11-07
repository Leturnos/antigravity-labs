"""State that Raft requires to survive crashes (the simulated "disk")."""

from __future__ import annotations

from dataclasses import dataclass, field

from .messages import LogEntry, NodeId


@dataclass
class PersistentState:
    """Durable per-node state.

    The simulation keeps this object alive across crashes while discarding the
    ``RaftNode`` instance, which models losing all volatile memory.
    """

    current_term: int = 0
    voted_for: NodeId | None = None
    entries: list[LogEntry] = field(default_factory=list)
    last_included_index: int = 0
    last_included_term: int = 0
    snapshot_data: bytes = b""
