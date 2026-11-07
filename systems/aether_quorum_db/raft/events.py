"""Observable node events, drained by the simulation for telemetry and checks."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .messages import NodeId


class Role(str, Enum):
    FOLLOWER = "follower"
    CANDIDATE = "candidate"
    LEADER = "leader"


@dataclass(frozen=True)
class RoleChanged:
    node_id: NodeId
    role: Role
    term: int
    leader_id: Optional[NodeId] = None
