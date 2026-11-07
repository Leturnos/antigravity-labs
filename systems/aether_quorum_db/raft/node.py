"""Sans-IO Raft node with leader election, log replication, snapshots and ReadIndex.

The node never touches sockets, threads or wall-clock time. Inputs arrive via
``tick()`` (one unit of logical time) and ``receive()`` (one message); outputs
are collected with ``take_messages()`` and ``take_events()``. This keeps the
consensus core deterministic and lets any transport drive it.
"""

from __future__ import annotations

import random
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from ..replication.state_machine import StateMachine
from .events import EntryApplied, EntryCommitted, Role, RoleChanged
from .log import RaftLog
from .messages import (
    AppendEntries,
    AppendEntriesResponse,
    Envelope,
    InstallSnapshot,
    InstallSnapshotResponse,
    LogEntry,
    Message,
    NodeId,
    RequestVote,
    RequestVoteResponse,
)
from .persistent_state import PersistentState


class NotLeaderError(Exception):
    """Raised when a client proposes a command to a non-leader."""

    def __init__(self, message: str, leader_id: NodeId | None = None) -> None:
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
        state_machine: StateMachine | None = None,
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
        self.leader_id: NodeId | None = None
        self.commit_index = self.log.last_included_index
        self.last_applied = self.log.last_included_index

        # Volatile state on candidates
        self._votes: set[NodeId] = set()

        # Volatile state on leaders
        self.next_index: dict[NodeId, int] = {}
        self.match_index: dict[NodeId, int] = {}
        self._heartbeat_round = 0

        # ReadIndex tracking: round -> (read_index, acks)
        self._read_index_requests: dict[int, tuple[int, set[NodeId]]] = {}
        self._confirmed_read_indexes: dict[int, int] = {}

        # Client session deduplication: client_id -> (last_sequence_num, last_result)
        self.client_sessions: dict[str, tuple[int, Any]] = {}

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

    def propose(
        self,
        command: Any,
        client_id: str | None = None,
        sequence_num: int | None = None,
    ) -> LogEntry:
        """Propose a new command to be appended and replicated across the cluster."""
        if self.role is not Role.LEADER:
            raise NotLeaderError(
                f"Node {self.node_id} is not leader (current leader: {self.leader_id})",
                leader_id=self.leader_id,
            )

        # Check client session deduplication
        if (
            client_id is not None
            and sequence_num is not None
            and client_id in self.client_sessions
        ):
            last_seq, _ = self.client_sessions[client_id]
            if sequence_num <= last_seq:
                # Duplicate command: return pseudo entry without appending
                return LogEntry(
                    term=self.current_term,
                    index=self.last_applied,
                    command=command,
                    client_id=client_id,
                    sequence_num=sequence_num,
                )

        entry = self.log.append_command(
            self.current_term,
            command,
            client_id=client_id,
            sequence_num=sequence_num,
        )

        # In single-node cluster, commit immediately
        if self.cluster_size == 1:
            self.commit_index = entry.index
            self._apply_committed()
            return entry

        # Trigger replication immediately to all peers
        for peer in self.peer_ids:
            self._send_replication_to(peer)

        return entry

    def request_read_index(self) -> int:
        """Start a ReadIndex protocol round. Returns a round ID to poll for completion."""
        if self.role is not Role.LEADER:
            raise NotLeaderError(
                f"Node {self.node_id} is not leader (current leader: {self.leader_id})",
                leader_id=self.leader_id,
            )

        self._heartbeat_round += 1
        round_id = self._heartbeat_round
        read_index = self.commit_index

        if self.cluster_size == 1:
            self._confirmed_read_indexes[round_id] = read_index
            return round_id

        self._read_index_requests[round_id] = (read_index, {self.node_id})
        for peer in self.peer_ids:
            self._send_replication_to(peer, round_override=round_id)
        return round_id

    def get_ready_read_index(self, round_id: int) -> int | None:
        """Check if the given ReadIndex round has quorum confirmation and is applied."""
        if round_id in self._confirmed_read_indexes:
            read_index = self._confirmed_read_indexes[round_id]
            if self.last_applied >= read_index:
                return read_index
        return None

    def compact_log(self, compact_up_to_index: int) -> None:
        """Create a snapshot of the state machine and discard compacted log entries."""
        compact_up_to_index = min(compact_up_to_index, self.last_applied)

        if compact_up_to_index <= self.log.last_included_index:
            return

        compact_term = self.log.term_at(compact_up_to_index)
        if compact_term is None:
            return

        snapshot_data = b""
        if self.state_machine is not None:
            snapshot_data = self.state_machine.create_snapshot()

        self.log.compact(compact_up_to_index, compact_term, snapshot_data)

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
            InstallSnapshot: self._on_install_snapshot,
            InstallSnapshotResponse: self._on_install_snapshot_response,
        }[type(message)]
        handler(envelope.source, message)

    def take_messages(self) -> list[Envelope]:
        messages, self._outbox = self._outbox, []
        return messages

    def take_events(self) -> list[object]:
        events, self._events = self._events, []
        return events

    # ---- Role transitions ------------------------------------------------

    def _become_follower(self, term: int, leader_id: NodeId | None) -> None:
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
        self._read_index_requests.clear()
        self._confirmed_read_indexes.clear()
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

        # 3 & 4. Append new entries, truncating conflicts (§5.3)
        for entry in request.entries:
            if entry.index <= self.log.last_index:
                if self.log.term_at(entry.index) != entry.term:
                    self.log.truncate_from(entry.index)
                    self.log.append(entry)
            else:
                self.log.append(entry)

        # 5. Advance commitIndex
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

        # Track ReadIndex acknowledgements
        if response.round in self._read_index_requests:
            read_index, acks = self._read_index_requests[response.round]
            acks.add(source)
            if len(acks) >= self.quorum:
                self._confirmed_read_indexes[response.round] = read_index
                del self._read_index_requests[response.round]

        if response.success:
            self.match_index[source] = max(self.match_index.get(source, 0), response.match_index)
            self.next_index[source] = response.match_index + 1
            self._advance_commit_index()

            # If follower still lags behind our latest log, send next slice
            if self.log.last_index >= self.next_index[source]:
                self._send_replication_to(source)
        else:
            if response.conflict_index > 0:
                self.next_index[source] = max(1, min(self.next_index[source] - 1, response.conflict_index))
            else:
                self.next_index[source] = max(1, self.next_index[source] - 1)
            self._send_replication_to(source)

    def _on_install_snapshot(self, source: NodeId, request: InstallSnapshot) -> None:
        if request.term < self.current_term:
            self._send(
                source,
                InstallSnapshotResponse(
                    term=self.current_term,
                    last_included_index=self.log.last_included_index,
                ),
            )
            return

        if self.role is not Role.FOLLOWER or self.leader_id != request.leader_id:
            self._become_follower(request.term, leader_id=request.leader_id)
        else:
            self._reset_election_timer()

        # Restore snapshot into state machine
        if self.state_machine is not None and request.data:
            self.state_machine.restore_snapshot(request.data)

        # Restore snapshot into log
        self.log.restore_snapshot(
            request.last_included_index,
            request.last_included_term,
            request.data,
        )

        self.commit_index = max(self.commit_index, request.last_included_index)
        self.last_applied = max(self.last_applied, request.last_included_index)

        self._send(
            source,
            InstallSnapshotResponse(
                term=self.current_term,
                last_included_index=request.last_included_index,
            ),
        )

    def _on_install_snapshot_response(self, source: NodeId, response: InstallSnapshotResponse) -> None:
        if response.term > self.current_term:
            self._become_follower(response.term, leader_id=None)
            return

        if self.role is not Role.LEADER or response.term != self.current_term:
            return

        self.match_index[source] = max(self.match_index.get(source, 0), response.last_included_index)
        self.next_index[source] = response.last_included_index + 1
        self._advance_commit_index()

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

            if entry.client_id is not None and entry.sequence_num is not None:
                self.client_sessions[entry.client_id] = (entry.sequence_num, result)

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
            self._send_replication_to(peer)

    def _send_replication_to(self, peer: NodeId, round_override: int | None = None) -> None:
        round_id = round_override if round_override is not None else self._heartbeat_round
        next_idx = self.next_index.get(peer, self.log.last_index + 1)

        # If follower's next_index has been compacted, send InstallSnapshot instead (§7)
        if next_idx <= self.log.last_included_index:
            snapshot_msg = InstallSnapshot(
                term=self.current_term,
                leader_id=self.node_id,
                last_included_index=self.log.last_included_index,
                last_included_term=self.log.last_included_term,
                data=self.log.snapshot_data,
            )
            self._send(peer, snapshot_msg)
            return

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
            round=round_id,
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
