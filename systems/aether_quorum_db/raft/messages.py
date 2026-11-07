"""Raft RPC messages (Figure 2 and Figure 13 of the Raft paper) as immutable dataclasses."""

from __future__ import annotations

from collections.abc import Hashable
from dataclasses import dataclass, field
from typing import Any

NodeId = Hashable


@dataclass(frozen=True)
class LogEntry:
    term: int
    index: int
    # None marks the no-op entry a new leader appends to commit entries from older terms.
    command: Any = None
    client_id: str | None = None
    sequence_num: int | None = None


@dataclass(frozen=True)
class RequestVote:
    term: int
    candidate_id: NodeId
    last_log_index: int
    last_log_term: int


@dataclass(frozen=True)
class RequestVoteResponse:
    term: int
    vote_granted: bool


@dataclass(frozen=True)
class AppendEntries:
    term: int
    leader_id: NodeId
    prev_log_index: int
    prev_log_term: int
    entries: tuple[LogEntry, ...] = ()
    leader_commit: int = 0
    # Heartbeat round echoed back by followers; lets the leader confirm it is
    # still leader for ReadIndex without appending to the log.
    round: int = 0


@dataclass(frozen=True)
class AppendEntriesResponse:
    term: int
    success: bool
    match_index: int = 0
    # On rejection, the first index the leader should retry from.
    conflict_index: int = 0
    round: int = 0


@dataclass(frozen=True)
class InstallSnapshot:
    term: int
    leader_id: NodeId
    last_included_index: int
    last_included_term: int
    data: bytes


@dataclass(frozen=True)
class InstallSnapshotResponse:
    term: int
    last_included_index: int


Message = (
    RequestVote
    | RequestVoteResponse
    | AppendEntries
    | AppendEntriesResponse
    | InstallSnapshot
    | InstallSnapshotResponse
)


@dataclass(frozen=True)
class Envelope:
    source: NodeId
    target: NodeId
    message: Message = field(compare=True)

    @property
    def kind(self) -> str:
        return type(self.message).__name__
