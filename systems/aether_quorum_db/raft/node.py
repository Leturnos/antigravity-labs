"""Sans-IO Raft node.

The node never touches sockets, threads or wall-clock time. Inputs arrive via
``tick()`` (one unit of logical time) and ``receive()`` (one message); outputs
are collected with ``take_messages()`` and ``take_events()``. This keeps the
consensus core deterministic and lets any transport drive it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from ..replication.state_machine import StateMachine
from .events import EntryApplied, EntryCommitted, Role, RoleChanged
from .log import RaftLog
from .messages import (
    AppendEntries,
    AppendEntriesResponse,
    Envelope,
    LogEntry,
    Message,
    NodeId,
    RequestVote,
    RequestVoteResponse,
)
from .persistent_state import PersistentState


class NotLeaderError(Exception):
    """Raised when a client proposes a command to a non-leader."""

    def __init__(self, message: str, leader_id: Optional[NodeId] = None) -> None:
        super().__init__(message)
        self.leader_id = leader_id


@dataclass(frozen=True)
class RaftConfig:
    election_timeout_min: int = 10
    election_timeout_max: int = 20
    heartbeat_interval: int = 3
    max_append_entries_batch: int = 50

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
        state_machine: Optional[StateMachine] = None,
    ) -> None:
        self.node_id = node_id
        self.peer_ids = tuple(peer for peer in peer_ids if peer != node_id)
        self.storage = storage
        self.log = RaftLog(storage)
        self.config = config or RaftConfig()
        self._rng = rng
        self.state_machine = state_machine

        # Volatile state on all servers
        self.role = Role.FOLLOWER
        self.leader_id: Optional[NodeId] = None
        self.commit_index = 0
        self.last_applied = 0

        # Volatile state on candidates
        self._votes: set[NodeId] = set()

        # Volatile state on leaders
        self.next_index: dict[NodeId, int] = {}
        self.match_index: dict[NodeId, int] = {}
        self._heartbeat_round = 0

        # Timers
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

    def propose(self, command: Any) -> LogEntry:
        """Propose a new command to be appended and replicated across the cluster."""
        if self.role is not Role.LEADER:
            raise NotLeaderError(
                f"Node {self.node_id} is not leader (current leader: {self.leader_id})",
                leader_id=self.leader_id,
            )

        entry = self.log.append_command(self.current_term, command)

        # In single-node cluster, commit immediately
        if self.cluster_size == 1:
            self.commit_index = entry.index
            self._apply_committed()
            return entry

        # Trigger replication immediately to all peers
        for peer in self.peer_ids:
            self._send_append_entries_to(peer)

        return entry

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
        self.next_index = {peer: self.log.last_index + 1 for peer in self.peer_ids}
        self.match_index = {peer: 0 for peer in self.peer_ids}
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
        # 1. Reply false if term < current_term (§5.1)
        if request.term < self.current_term:
            self._send(
                source,
                AppendEntriesResponse(
                    term=self.current_term,
                    success=False,
                    match_index=self.log.last_index,
                    conflict_index=self.log.last_index + 1,
                    round=request.round,
                ),
            )
            return

        # Valid leader acknowledged
        if self.role is not Role.FOLLOWER or self.leader_id != request.leader_id:
            self._become_follower(request.term, leader_id=request.leader_id)
        else:
            self._reset_election_timer()

        # 2. Reply false if log doesn't contain entry at prev_log_index matching prev_log_term (§5.3)
        if request.prev_log_index > self.log.last_index:
            self._send(
                source,
                AppendEntriesResponse(
                    term=self.current_term,
                    success=False,
                    match_index=self.log.last_index,
                    conflict_index=self.log.last_index + 1,
                    round=request.round,
                ),
            )
            return

        if request.prev_log_index > 0:
            actual_term = self.log.term_at(request.prev_log_index)
            if actual_term != request.prev_log_term:
                # Conflict optimization: find first index of the conflicting term
                conflict_term = actual_term
                conflict_index = request.prev_log_index
                while conflict_index > 1 and self.log.term_at(conflict_index - 1) == conflict_term:
                    conflict_index -= 1
                self._send(
                    source,
                    AppendEntriesResponse(
                        term=self.current_term,
                        success=False,
                        match_index=self.log.last_index,
                        conflict_index=conflict_index,
                        round=request.round,
                    ),
                )
                return

        # 3 & 4. Append any new entries not already in the log, truncating conflicts (§5.3)
        for entry in request.entries:
            if entry.index <= self.log.last_index:
                if self.log.term_at(entry.index) != entry.term:
                    self.log.truncate_from(entry.index)
                    self.log.append(entry)
            else:
                self.log.append(entry)

        # 5. If leaderCommit > commitIndex, set commitIndex = min(leaderCommit, index of last new entry)
        if request.leader_commit > self.commit_index:
            self.commit_index = min(request.leader_commit, self.log.last_index)
            self._apply_committed()

        self._send(
            source,
            AppendEntriesResponse(
                term=self.current_term,
                success=True,
                match_index=self.log.last_index,
                round=request.round,
            ),
        )

    def _on_append_entries_response(self, source: NodeId, response: AppendEntriesResponse) -> None:
        if response.term > self.current_term:
            self._become_follower(response.term, leader_id=None)
            return

        if self.role is not Role.LEADER or response.term != self.current_term:
            return

        if response.success:
            self.match_index[source] = max(self.match_index.get(source, 0), response.match_index)
            self.next_index[source] = response.match_index + 1
            self._advance_commit_index()

            # If follower still lags behind our latest log, send next slice
            if self.log.last_index >= self.next_index[source]:
                self._send_append_entries_to(source)
        else:
            # Rejection: back up next_index for this follower
            if response.conflict_index > 0:
                self.next_index[source] = max(1, min(self.next_index[source] - 1, response.conflict_index))
            else:
                self.next_index[source] = max(1, self.next_index[source] - 1)
            self._send_append_entries_to(source)

    # ---- Helpers ---------------------------------------------------------

    def _advance_commit_index(self) -> None:
        matches = [self.log.last_index] + [self.match_index.get(peer, 0) for peer in self.peer_ids]
        matches.sort(reverse=True)
        median_match = matches[self.quorum - 1]

        # Raft §5.4.2: only commit entries from current term directly by counting replicas
        for n in range(median_match, self.commit_index, -1):
            if self.log.term_at(n) == self.current_term:
                self.commit_index = n
                self._apply_committed()
                break

    def _apply_committed(self) -> None:
        while self.commit_index > self.last_applied:
            self.last_applied += 1
            entry = self.log.entry_at(self.last_applied)
            self._events.append(EntryCommitted(node_id=self.node_id, entry=entry))

            result = None
            if self.state_machine is not None and entry.command is not None:
                result = self.state_machine.apply(entry.command)

            self._events.append(
                EntryApplied(
                    node_id=self.node_id,
                    index=self.last_applied,
                    command=entry.command,
                    result=result,
                )
            )

    def _broadcast_heartbeat(self) -> None:
        self._heartbeat_elapsed = 0
        self._heartbeat_round += 1
        for peer in self.peer_ids:
            self._send_append_entries_to(peer)

    def _send_append_entries_to(self, peer: NodeId) -> None:
        next_idx = self.next_index.get(peer, self.log.last_index + 1)
        prev_idx = next_idx - 1
        prev_term = self.log.term_at(prev_idx) or 0
        entries = self.log.slice(next_idx, limit=self.config.max_append_entries_batch)

        heartbeat = AppendEntries(
            term=self.current_term,
            leader_id=self.node_id,
            prev_log_index=prev_idx,
            prev_log_term=prev_term,
            entries=entries,
            leader_commit=self.commit_index,
            round=self._heartbeat_round,
        )
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
