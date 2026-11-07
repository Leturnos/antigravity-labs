"""Deterministic cluster coordinator for simulation, tests and telemetry."""

from __future__ import annotations

import random
from typing import Callable, Iterable, Optional, Sequence

from ..raft.events import Role, RoleChanged
from ..raft.messages import Envelope, LogEntry, NodeId
from ..raft.node import RaftConfig, RaftNode
from ..raft.persistent_state import PersistentState
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
    ) -> None:
        self.node_ids = tuple(node_ids)
        self.seed = seed
        self._rng = random.Random(seed)
        self.network_config = network_config or NetworkConfig()
        self.raft_config = raft_config or RaftConfig()

        self.clock = VirtualClock()
        self.network = SimulatedNetwork[Envelope](self._rng, self.network_config)
        self.invariants = InvariantChecker()

        # Durable state survives across node crashes
        self.storages: dict[NodeId, PersistentState] = {
            node_id: PersistentState() for node_id in self.node_ids
        }
        self.running_nodes: set[NodeId] = set(self.node_ids)
        self.nodes: dict[NodeId, RaftNode] = {}
        self._node_rngs: dict[NodeId, random.Random] = {}

        for node_id in self.node_ids:
            # Deterministic child RNG for each node based on master seed and node_id
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
        """Restart a crashed node with fresh volatile memory but same persistent state."""
        self.crash_node(node_id)
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

            # 5. Check ongoing invariants
            active_leaders = [
                (node.node_id, node.current_term)
                for node in self.nodes.values()
                if node.node_id in self.running_nodes and node.role is Role.LEADER
            ]
            self.invariants.check_election_safety(active_leaders)

    def run_until(self, predicate: Callable[[SimulationCluster], bool], max_ticks: int = 500) -> bool:
        """Step the cluster until predicate returns True, or max_ticks is reached."""
        for _ in range(max_ticks):
            if predicate(self):
                return True
            self.step(1)
        return predicate(self)

    def run_until_leader(self, max_ticks: int = 500) -> Optional[RaftNode]:
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
    def leader(self) -> Optional[RaftNode]:
        """Returns the leader if there is exactly one active leader."""
        leaders = [
            n for n in self.nodes.values()
            if n.node_id in self.running_nodes and n.role is Role.LEADER
        ]
        return leaders[0] if len(leaders) == 1 else None

    def get_leaders(self) -> list[tuple[NodeId, int]]:
        return [
            (n.node_id, n.current_term)
            for n in self.nodes.values()
            if n.node_id in self.running_nodes and n.role is Role.LEADER
        ]
