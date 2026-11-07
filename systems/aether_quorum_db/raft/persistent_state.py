"""State that Raft requires to survive crashes (the simulated "disk")."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .messages import LogEntry, NodeId


@dataclass
class PersistentState:
    """Durable per-node state.

    The simulation keeps this object alive across crashes while discarding the
    ``RaftNode`` instance, which models losing all volatile memory.
    """

    current_term: int = 0
    voted_for: Optional[NodeId] = None
    entries: list[LogEntry] = field(default_factory=list)
