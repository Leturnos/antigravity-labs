"""Chaos fault injection scenarios for simulation testing and telemetry."""

from __future__ import annotations

from ..raft.messages import NodeId
from .cluster import SimulationCluster
from .network import NetworkConfig


def isolate_leader(cluster: SimulationCluster) -> NodeId | None:
    """Isolate the current active leader in a partition by itself."""
    leader = cluster.leader
    if leader is None:
        return None
    leader_id = leader.node_id
    others = [nid for nid in cluster.node_ids if nid != leader_id]
    cluster.partition([[leader_id], others])
    return leader_id


def partition_majority_minority(
    cluster: SimulationCluster,
    minority_size: int = 1,
) -> tuple[list[NodeId], list[NodeId]]:
    """Partition the cluster into a minority and a majority partition."""
    nodes = list(cluster.node_ids)
    minority = nodes[:minority_size]
    majority = nodes[minority_size:]
    cluster.partition([minority, majority])
    return minority, majority


def crash_and_recover(cluster: SimulationCluster, node_id: NodeId, down_ticks: int = 30) -> None:
    """Crash a specific node, simulate passage of time, then restart it."""
    cluster.crash_node(node_id)
    cluster.step(ticks=down_ticks)
    cluster.restart_node(node_id)


def flaky_network(cluster: SimulationCluster, drop_rate: float = 0.25, max_latency: int = 6) -> None:
    """Apply high latency and packet loss to simulate a degraded network."""
    cluster.network.config = NetworkConfig(
        min_latency=1,
        max_latency=max_latency,
        drop_rate=drop_rate,
        duplicate_rate=0.05,
    )


def reset_network(cluster: SimulationCluster) -> None:
    """Heal partitions and restore clean network configuration."""
    cluster.heal_network()
    cluster.network.config = NetworkConfig(min_latency=1, max_latency=3, drop_rate=0.0)
