"""Observable node events, drained by the simulation for telemetry and checks."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from .messages import LogEntry, NodeId


class Role(str, Enum):
    FOLLOWER = "follower"
    CANDIDATE = "candidate"
    LEADER = "leader"


@dataclass(frozen=True)
class RoleChanged:
    node_id: NodeId
    role: Role
    term: int
    leader_id: NodeId | None = None


@dataclass(frozen=True)
class EntryCommitted:
    node_id: NodeId
    entry: LogEntry


@dataclass(frozen=True)
class EntryApplied:
    node_id: NodeId
    index: int
    command: Any
    result: Any = None
