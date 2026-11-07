"""Deterministic cluster coordinator for simulation, tests and telemetry."""

from __future__ import annotations

import random
from collections.abc import Callable, Iterable, Sequence
from typing import Any

from ..raft.events import EntryApplied, EntryCommitted, Role, RoleChanged
from ..raft.messages import Envelope, LogEntry, NodeId
from ..raft.node import NotLeaderError, RaftConfig, RaftNode
from ..raft.persistent_state import PersistentState
from ..replication.state_machine import KVStateMachine, StateMachine
from .clock import VirtualClock
from .invariants import InvariantChecker
from .network import NetworkConfig, SimulatedNetwork


class SimulationCluster:
    """Manages virtual nodes, durable states, network, and invariant checking."""

    def __init__(
        self,
        node_ids: Sequence[NodeId] = (0, 1, 2),
        seed: int = 42,
        network_config: NetworkConfig | None = None,
        raft_config: RaftConfig | None = None,
        state_machine_factory: Callable[[], StateMachine] = KVStateMachine,
    ) -> None:
        self.node_ids = tuple(node_ids)
        self.seed = seed
        self._rng = random.Random(seed)
        self.network_config = network_config or NetworkConfig()
        self.raft_config = raft_config or RaftConfig()
        self.state_machine_factory = state_machine_factory

        self.clock = VirtualClock()
        self.network = SimulatedNetwork[Envelope](self._rng, self.network_config)
        self.invariants = InvariantChecker()

        # Durable state survives across node crashes
        self.storages: dict[NodeId, PersistentState] = {
            node_id: PersistentState() for node_id in self.node_ids
        }
        self.state_machines: dict[NodeId, StateMachine] = {
            node_id: self.state_machine_factory() for node_id in self.node_ids
        }
        self.running_nodes: set[NodeId] = set(self.node_ids)
        self.nodes: dict[NodeId, RaftNode] = {}
        self._node_rngs: dict[NodeId, random.Random] = {}

        for node_id in self.node_ids:
            node_seed = self._rng.randint(0, 2**31 - 1)
            self._node_rngs[node_id] = random.Random(node_seed)
            self._spawn_node(node_id)

        self.event_log: list[tuple[int, object]] = []

    def _spawn_node(self, node_id: NodeId) -> RaftNode:
        node = RaftNode(
            node_id=node_id,
            peer_ids=self.node_ids,
            storage=self.storages[node_id],
            rng=self._node_rngs[node_id],
            config=self.raft_config,
            state_machine=self.state_machines[node_id],
        )
        self.nodes[node_id] = node
        return node

    # ---- Node Lifecycle --------------------------------------------------

    def crash_node(self, node_id: NodeId) -> None:
        """Crash a node: volatile state is lost, outbox cleared, durable storage stays."""
        if node_id in self.running_nodes:
            self.running_nodes.remove(node_id)
            if node_id in self.nodes:
                self.nodes[node_id].take_messages()
                self.nodes[node_id].take_events()

    def restart_node(self, node_id: NodeId) -> RaftNode:
        """Restart a crashed node with fresh volatile memory and durable snapshot/log."""
        self.crash_node(node_id)
        # Restore state machine from durable snapshot if present
        sm = self.state_machine_factory()
        if self.storages[node_id].snapshot_data:
            sm.restore_snapshot(self.storages[node_id].snapshot_data)
        self.state_machines[node_id] = sm

        node = self._spawn_node(node_id)
        self.running_nodes.add(node_id)
        return node

    def is_running(self, node_id: NodeId) -> bool:
        return node_id in self.running_nodes

    # ---- Network Control -------------------------------------------------

    def partition(self, groups: Iterable[Iterable[NodeId]]) -> None:
        self.network.partition(groups)

    def heal_network(self) -> None:
        self.network.heal()

    # ---- Proposing Commands & Queries ------------------------------------

    def propose(
        self,
        command: Any,
        client_id: str | None = None,
        sequence_num: int | None = None,
    ) -> LogEntry:
        """Propose a command through the current leader."""
        leader = self.leader
        if leader is None:
            raise NotLeaderError("No active leader in the cluster to propose command to")
        return leader.propose(command, client_id=client_id, sequence_num=sequence_num)

    def linearizable_read(
        self,
        query_fn: Callable[[StateMachine], Any],
        max_ticks: int = 100,
    ) -> Any:
        """Execute a linearizable read via the ReadIndex protocol (§8)."""
        leader = self.leader
        if leader is None:
            raise NotLeaderError("No active leader in the cluster for linearizable read")

        round_id = leader.request_read_index()

        def is_ready(c: SimulationCluster) -> bool:
            curr_leader = c.leader
            if curr_leader is None or curr_leader.node_id != leader.node_id:
                raise NotLeaderError("Leader lost during ReadIndex confirmation")
            return curr_leader.get_ready_read_index(round_id) is not None

        if not self.run_until(is_ready, max_ticks=max_ticks):
            raise TimeoutError(f"ReadIndex round {round_id} timed out after {max_ticks} ticks")

        return query_fn(self.state_machines[leader.node_id])

    def compact_log(self, node_id: NodeId, up_to_index: int) -> None:
        """Force a node to snapshot and compact its log up to the specified index."""
        if node_id in self.nodes:
            self.nodes[node_id].compact_log(up_to_index)

    # ---- SQL Execution & State Checksums ---------------------------------

    def execute_sql(
        self,
        sql: str,
        client_id: str | None = None,
        sequence_num: int | None = None,
        max_ticks: int = 100,
    ) -> Any:
        """Executes a SQL query or statement on the distributed cluster."""
        from ..sql.ast import Explain, Select
        from ..sql.parser import Parser

        stmt = Parser.parse_sql(sql)
        if isinstance(stmt, (Select, Explain)):
            return self.linearizable_read(
                lambda sm: sm.query(sql) if hasattr(sm, "query") else sm.apply(sql),
                max_ticks=max_ticks,
            )

        entry = self.propose(sql, client_id=client_id, sequence_num=sequence_num)

        def is_committed(c: SimulationCluster) -> bool:
            curr_leader = c.leader
            return curr_leader is not None and curr_leader.commit_index >= entry.index

        if not self.run_until(is_committed, max_ticks=max_ticks):
            raise TimeoutError(f"SQL statement timed out waiting for commit: {sql}")

        # Extract result from leader's application
        leader = self.leader
        if leader is not None:
            # Let remaining running nodes catch up to the committed entry
            self.step(ticks=10)

        # Look for the applied result in recent event log
        for _, event in reversed(self.event_log):
            if isinstance(event, EntryApplied) and event.index == entry.index:
                return event.result

        return None

    def get_state_checksums(self) -> dict[NodeId, str]:
        """Compute state hash for all nodes that support state_checksum()."""
        return {
            nid: sm.state_checksum()
            for nid, sm in self.state_machines.items()
            if hasattr(sm, "state_checksum")
        }

    # ---- Stepping & Execution -------------------------------------------

    def step(self, ticks: int = 1) -> None:
        """Advance time by ``ticks``, delivering messages, ticking nodes, checking invariants."""
        for _ in range(ticks):
            self.clock.advance(1)
            now = self.clock.now

            # 1. Deliver due network messages to running target nodes
            delivered = self.network.deliver_due(now)
            for envelope in delivered:
                if envelope.target in self.running_nodes:
                    node = self.nodes[envelope.target]
                    node.receive(envelope)

            # 2. Tick running nodes
            for node_id in sorted(self.running_nodes, key=lambda n: str(n)):
                node = self.nodes[node_id]
                node.tick()

            # 3. Collect outbox messages and transmit through simulated network
            for node_id in sorted(self.running_nodes, key=lambda n: str(n)):
                node = self.nodes[node_id]
                for envelope in node.take_messages():
                    self.network.send(envelope, now)

            # 4. Drain events and run invariant checks
            for node_id in sorted(self.running_nodes, key=lambda n: str(n)):
                node = self.nodes[node_id]
                for event in node.take_events():
                    self.event_log.append((now, event))
                    if isinstance(event, RoleChanged):
                        self.invariants.on_role_changed(event.node_id, event.role, event.term)
                    elif isinstance(event, EntryCommitted):
                        if node.role is Role.LEADER:
                            self.invariants.on_commit(event.entry)
                    elif isinstance(event, EntryApplied):
                        self.invariants.on_apply(event.node_id, event.index, event.command)

            # 5. Check ongoing invariants
            active_leaders = [
                (node.node_id, node.current_term)
                for node in self.nodes.values()
                if node.node_id in self.running_nodes and node.role is Role.LEADER
            ]
            self.invariants.check_election_safety(active_leaders)
            self.invariants.check_log_matching(
                {n_id: n.storage.entries for n_id, n in self.nodes.items()}
            )
            leaders_with_logs = [
                (node.node_id, node.current_term, node.log.last_included_index, node.storage.entries)
                for node in self.nodes.values()
                if node.node_id in self.running_nodes and node.role is Role.LEADER
            ]
            self.invariants.check_leader_completeness(leaders_with_logs)

    def run_until(self, predicate: Callable[[SimulationCluster], bool], max_ticks: int = 500) -> bool:
        """Step the cluster until predicate returns True, or max_ticks is reached."""
        for _ in range(max_ticks):
            if predicate(self):
                return True
            self.step(1)
        return predicate(self)

    def run_until_leader(self, max_ticks: int = 500) -> RaftNode | None:
        """Convenience method: step until a single undisputed leader is established."""
        def has_leader(c: SimulationCluster) -> bool:
            leaders = [
                n for n in c.nodes.values()
                if n.node_id in c.running_nodes and n.role is Role.LEADER
            ]
            return len(leaders) == 1

        if self.run_until(has_leader, max_ticks=max_ticks):
            return self.leader
        return None

    # ---- State Inspection ------------------------------------------------

    @property
    def leader(self) -> RaftNode | None:
        """Returns the leader if there is exactly one active leader.

        If multiple leaders exist due to network partitions, returns the leader
        with the highest term.
        """
        leaders = [
            n for n in self.nodes.values()
            if n.node_id in self.running_nodes and n.role is Role.LEADER
        ]
        if not leaders:
            return None
        if len(leaders) == 1:
            return leaders[0]
        max_term = max(n.current_term for n in leaders)
        highest = [n for n in leaders if n.current_term == max_term]
        return highest[0] if len(highest) == 1 else None

    def get_leaders(self) -> list[tuple[NodeId, int]]:
        return [
            (n.node_id, n.current_term)
            for n in self.nodes.values()
            if n.node_id in self.running_nodes and n.role is Role.LEADER
        ]
