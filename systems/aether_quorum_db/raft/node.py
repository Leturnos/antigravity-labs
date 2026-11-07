"""Sans-IO Raft node.

The node never touches sockets, threads or wall-clock time. Inputs arrive via
``tick()`` (one unit of logical time) and ``receive()`` (one message); outputs
are collected with ``take_messages()`` and ``take_events()``. This keeps the
consensus core deterministic and lets any transport drive it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable, Optional

from .events import Role, RoleChanged
from .log import RaftLog
from .messages import (
    AppendEntries,
    AppendEntriesResponse,
    Envelope,
    Message,
    NodeId,
    RequestVote,
    RequestVoteResponse,
)
from .persistent_state import PersistentState


@dataclass(frozen=True)
class RaftConfig:
    election_timeout_min: int = 10
    election_timeout_max: int = 20
    heartbeat_interval: int = 3

    def __post_init__(self) -> None:
        if not 0 < self.heartbeat_interval < self.election_timeout_min <= self.election_timeout_max:
            raise ValueError(
                "timeouts must satisfy 0 < heartbeat_interval < election_timeout_min <= election_timeout_max"
            )


class RaftNode:
    def __init__(
        self,
        node_id: NodeId,
        peer_ids: Iterable[NodeId],
        storage: PersistentState,
        rng: random.Random,
        config: RaftConfig | None = None,
    ) -> None:
        self.node_id = node_id
        self.peer_ids = tuple(peer for peer in peer_ids if peer != node_id)
        self.storage = storage
        self.log = RaftLog(storage)
        self.config = config or RaftConfig()
        self._rng = rng

        self.role = Role.FOLLOWER
        self.leader_id: Optional[NodeId] = None
        self._votes: set[NodeId] = set()
        self._election_elapsed = 0
        self._heartbeat_elapsed = 0
        self._election_timeout = self._random_election_timeout()

        self._outbox: list[Envelope] = []
        self._events: list[object] = []

    # ---- Public API ------------------------------------------------------

    @property
    def current_term(self) -> int:
        return self.storage.current_term

    @property
    def cluster_size(self) -> int:
        return len(self.peer_ids) + 1

    @property
    def quorum(self) -> int:
        return self.cluster_size // 2 + 1

    def tick(self) -> None:
        if self.role is Role.LEADER:
            self._heartbeat_elapsed += 1
            if self._heartbeat_elapsed >= self.config.heartbeat_interval:
                self._broadcast_heartbeat()
            return
        self._election_elapsed += 1
        if self._election_elapsed >= self._election_timeout:
            self._start_election()

    def receive(self, envelope: Envelope) -> None:
        message = envelope.message
        if message.term > self.current_term:
            self._become_follower(message.term, leader_id=None)

        handler = {
            RequestVote: self._on_request_vote,
            RequestVoteResponse: self._on_request_vote_response,
            AppendEntries: self._on_append_entries,
            AppendEntriesResponse: self._on_append_entries_response,
        }[type(message)]
        handler(envelope.source, message)

    def take_messages(self) -> list[Envelope]:
        messages, self._outbox = self._outbox, []
        return messages

    def take_events(self) -> list[object]:
        events, self._events = self._events, []
        return events

    # ---- Role transitions ------------------------------------------------

    def _become_follower(self, term: int, leader_id: Optional[NodeId]) -> None:
        changed = self.role is not Role.FOLLOWER or term != self.current_term or leader_id != self.leader_id
        if term != self.current_term:
            self.storage.current_term = term
            self.storage.voted_for = None
        self.role = Role.FOLLOWER
        self.leader_id = leader_id
        self._reset_election_timer()
        if changed:
            self._emit_role_change()

    def _start_election(self) -> None:
        self.storage.current_term += 1
        self.storage.voted_for = self.node_id
        self.role = Role.CANDIDATE
        self.leader_id = None
        self._votes = {self.node_id}
        self._reset_election_timer()
        self._emit_role_change()

        if len(self._votes) >= self.quorum:
            self._become_leader()
            return
        request = RequestVote(
            term=self.current_term,
            candidate_id=self.node_id,
            last_log_index=self.log.last_index,
            last_log_term=self.log.last_term,
        )
        for peer in self.peer_ids:
            self._send(peer, request)

    def _become_leader(self) -> None:
        self.role = Role.LEADER
        self.leader_id = self.node_id
        self._emit_role_change()
        self._broadcast_heartbeat()

    # ---- Handlers --------------------------------------------------------

    def _on_request_vote(self, source: NodeId, request: RequestVote) -> None:
        can_vote = self.storage.voted_for in (None, request.candidate_id)
        granted = (
            request.term == self.current_term
            and can_vote
            and self.log.is_up_to_date(request.last_log_index, request.last_log_term)
        )
        if granted:
            self.storage.voted_for = request.candidate_id
            self._reset_election_timer()
        self._send(source, RequestVoteResponse(term=self.current_term, vote_granted=granted))

    def _on_request_vote_response(self, source: NodeId, response: RequestVoteResponse) -> None:
        if self.role is not Role.CANDIDATE or response.term != self.current_term or not response.vote_granted:
            return
        self._votes.add(source)
        if len(self._votes) >= self.quorum:
            self._become_leader()

    def _on_append_entries(self, source: NodeId, request: AppendEntries) -> None:
        if request.term < self.current_term:
            self._send(source, AppendEntriesResponse(term=self.current_term, success=False))
            return
        if self.role is not Role.FOLLOWER or self.leader_id != request.leader_id:
            self._become_follower(request.term, leader_id=request.leader_id)
        else:
            self._reset_election_timer()
        self._send(source, AppendEntriesResponse(term=self.current_term, success=True, round=request.round))

    def _on_append_entries_response(self, source: NodeId, response: AppendEntriesResponse) -> None:
        # Replication bookkeeping is added together with log replication.
        return

    # ---- Helpers ---------------------------------------------------------

    def _broadcast_heartbeat(self) -> None:
        self._heartbeat_elapsed = 0
        heartbeat = AppendEntries(
            term=self.current_term,
            leader_id=self.node_id,
            prev_log_index=self.log.last_index,
            prev_log_term=self.log.last_term,
        )
        for peer in self.peer_ids:
            self._send(peer, heartbeat)

    def _send(self, target: NodeId, message: Message) -> None:
        self._outbox.append(Envelope(source=self.node_id, target=target, message=message))

    def _reset_election_timer(self) -> None:
        self._election_elapsed = 0
        self._election_timeout = self._random_election_timeout()

    def _random_election_timeout(self) -> int:
        return self._rng.randint(self.config.election_timeout_min, self.config.election_timeout_max)

    def _emit_role_change(self) -> None:
        self._events.append(RoleChanged(self.node_id, self.role, self.current_term, self.leader_id))
