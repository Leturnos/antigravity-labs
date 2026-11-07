"""Raft safety invariant checkers.

Checks the invariants defined in Section 5.2 / Figure 3 of the Raft paper:
- Election Safety: at most one leader can be elected in a given term.
- Log Matching: if two logs contain an entry with the same index and term,
  then the logs are identical in all entries up to that index.
- Leader Completeness: if a log entry is committed in a given term, it will
  be present in the logs of the leaders for all higher-numbered terms.
- State Machine Safety: if a server has applied a log entry at a given index
  to its state machine, no other server will ever apply a different log entry
  for the same index.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from ..raft.events import Role
from ..raft.messages import LogEntry, NodeId


class InvariantViolation(Exception):
    """Raised when a core Raft safety guarantee is broken."""


class InvariantChecker:
    """Tracks cluster history and validates safety properties."""

    def __init__(self) -> None:
        # term -> leader_id who was elected in that term
        self._leaders_by_term: dict[int, NodeId] = {}
        # index -> {node_id -> applied command}
        self._applied_entries: dict[int, dict[NodeId, Any]] = {}
        # index -> committed entry
        self._committed_entries: dict[int, LogEntry] = {}

    def on_role_changed(self, node_id: NodeId, role: Role, term: int) -> None:
        if role is Role.LEADER:
            existing = self._leaders_by_term.get(term)
            if existing is not None and existing != node_id:
                raise InvariantViolation(
                    f"Election Safety violated: multiple leaders elected in term {term} "
                    f"({existing} and {node_id})"
                )
            self._leaders_by_term[term] = node_id

    def check_election_safety(self, current_leaders: Sequence[tuple[NodeId, int]]) -> None:
        """Check that no two nodes currently believe they are leaders in the same term."""
        seen: dict[int, NodeId] = {}
        for node_id, term in current_leaders:
            if term in seen and seen[term] != node_id:
                raise InvariantViolation(
                    f"Election Safety violated: two active leaders in term {term}: "
                    f"{seen[term]} and {node_id}"
                )
            seen[term] = node_id

    def check_log_matching(self, logs: dict[NodeId, Sequence[LogEntry]]) -> None:
        """If two logs contain an entry with same index & term, prefix must match."""
        nodes = list(logs.keys())
        for i in range(len(nodes)):
            map_a = {e.index: e for e in logs[nodes[i]]}
            for j in range(i + 1, len(nodes)):
                map_b = {e.index: e for e in logs[nodes[j]]}
                common_indices = sorted(set(map_a.keys()) & set(map_b.keys()))
                for idx in common_indices:
                    ea = map_a[idx]
                    eb = map_b[idx]
                    if ea.term == eb.term:
                        # Prior common entries must match
                        for prior_idx in [p for p in common_indices if p < idx]:
                            pa = map_a[prior_idx]
                            pb = map_b[prior_idx]
                            if (pa.term, pa.command) != (pb.term, pb.command):
                                raise InvariantViolation(
                                    f"Log Matching violated between {nodes[i]} and {nodes[j]} "
                                    f"at prefix index {pa.index} prior to matching entry at {ea.index}"
                                )

    def on_commit(self, entry: LogEntry) -> None:
        existing = self._committed_entries.get(entry.index)
        if existing is not None:
            if (existing.term, existing.command) != (entry.term, entry.command):
                raise InvariantViolation(
                    f"State Machine / Commit Safety violated at index {entry.index}: "
                    f"already committed {existing}, now committing {entry}"
                )
        else:
            self._committed_entries[entry.index] = entry

    def on_apply(self, node_id: NodeId, index: int, command: Any) -> None:
        node_map = self._applied_entries.setdefault(index, {})
        for other_node, other_cmd in node_map.items():
            if other_cmd != command:
                raise InvariantViolation(
                    f"State Machine Safety violated at index {index}: "
                    f"{other_node} applied {other_cmd!r} but {node_id} applied {command!r}"
                )
        node_map[node_id] = command

    def check_leader_completeness(
        self,
        leaders: Sequence[tuple[NodeId, int, int, Sequence[LogEntry]]],
    ) -> None:
        """Entries committed in term T must be present in leaders of term > T (§5.4.3).

        Tuple is: (leader_id, leader_term, last_included_index, leader_log_entries)
        """
        for leader_id, leader_term, last_included_idx, leader_log in leaders:
            leader_entries = {e.index: e for e in leader_log}
            for committed_idx, committed_entry in self._committed_entries.items():
                if committed_entry.term < leader_term:
                    # If entry has been compacted into leader's snapshot, it is preserved
                    if committed_idx <= last_included_idx:
                        continue
                    if committed_idx not in leader_entries:
                        raise InvariantViolation(
                            f"Leader Completeness violated: leader {leader_id} in term {leader_term} "
                            f"missing committed entry at index {committed_idx} (from term {committed_entry.term})"
                        )
                    le = leader_entries[committed_idx]
                    if (le.term, le.command) != (committed_entry.term, committed_entry.command):
                        raise InvariantViolation(
                            f"Leader Completeness violated: leader {leader_id} in term {leader_term} "
                            f"has conflicting entry at committed index {committed_idx}"
                        )
