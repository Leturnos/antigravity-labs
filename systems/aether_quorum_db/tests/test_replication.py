"""Tests for Raft log replication, commit safety, and state machine application."""

import pytest

from systems.aether_quorum_db.raft.events import Role
from systems.aether_quorum_db.raft.node import NotLeaderError
from systems.aether_quorum_db.simulation.cluster import SimulationCluster
from systems.aether_quorum_db.simulation.network import NetworkConfig


def test_single_node_commit_and_apply():
    cluster = SimulationCluster(node_ids=[0], seed=1)
    leader = cluster.run_until_leader(max_ticks=50)
    assert leader is not None

    entry = cluster.propose(["put", "foo", "bar"])
    assert entry.index == 1
    assert leader.commit_index == 1
    assert leader.last_applied == 1
    assert cluster.state_machines[0].get("foo") == "bar"


def test_three_node_replicate_commit_and_apply():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=42)
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None

    entry = cluster.propose(["put", "key1", "val1"])
    assert entry.index == 1

    # Step to allow replication and commit index propagation
    cluster.run_until(lambda c: all(n.commit_index == 1 for n in c.nodes.values()), max_ticks=50)

    for node_id, node in cluster.nodes.items():
        assert node.commit_index == 1
        assert node.last_applied == 1
        assert cluster.state_machines[node_id].get("key1") == "val1"


def test_sequential_proposals_apply_deterministically():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=10)
    cluster.run_until_leader(max_ticks=100)

    # Propose 5 commands in sequence
    for i in range(5):
        cluster.propose(["put", f"k{i}", f"v{i}"])
        cluster.step(ticks=2)

    # Allow all nodes to catch up
    cluster.run_until(lambda c: all(n.commit_index == 5 for n in c.nodes.values()), max_ticks=100)

    expected_data = {f"k{i}": f"v{i}" for i in range(5)}
    for node_id in cluster.node_ids:
        assert cluster.state_machines[node_id].data == expected_data


def test_cannot_propose_to_follower():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=7)
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None

    # Step so heartbeats propagate leader ID to followers
    cluster.step(ticks=10)

    follower = next(n for n in cluster.nodes.values() if n.role is Role.FOLLOWER)
    with pytest.raises(NotLeaderError) as exc_info:
        follower.propose(["put", "k", "v"])
    assert exc_info.value.leader_id == leader.node_id


def test_commit_requires_majority():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=12)
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None
    leader_id = leader.node_id

    # Partition leader away from both followers: [leader] vs [f1, f2]
    other_nodes = [nid for nid in cluster.node_ids if nid != leader_id]
    cluster.partition([[leader_id], other_nodes])

    # Leader proposes command while partitioned
    leader.propose(["put", "uncommitted", "secret"])
    cluster.step(ticks=20)

    # Without majority, command must not be committed on the isolated leader
    assert leader.commit_index == 0
    assert cluster.state_machines[leader_id].get("uncommitted") is None

    # Heal network
    cluster.heal_network()
    cluster.step(ticks=50)

    # Wait for cluster to stabilize, elect leader if needed and replicate
    active_leader = cluster.run_until_leader(max_ticks=100)
    assert active_leader is not None


def test_overwrite_uncommitted_entries_from_previous_term():
    # Setup 3 nodes
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=88)
    l1 = cluster.run_until_leader(max_ticks=100)
    assert l1 is not None
    l1_id = l1.node_id
    f1_id, f2_id = [n for n in cluster.node_ids if n != l1_id]

    # Isolate l1 before it can replicate to anyone
    cluster.partition([[l1_id], [f1_id, f2_id]])
    l1.propose(["put", "abandoned", "value"])
    assert l1.log.last_index == 1
    assert l1.commit_index == 0

    # Let [f1, f2] elect a new leader l2 in higher term
    def has_new_leader(c: SimulationCluster) -> bool:
        leaders = [n for n in [c.nodes[f1_id], c.nodes[f2_id]] if n.role is Role.LEADER]
        return len(leaders) == 1

    assert cluster.run_until(has_new_leader, max_ticks=150)
    l2 = next(n for n in [cluster.nodes[f1_id], cluster.nodes[f2_id]] if n.role is Role.LEADER)
    assert l2 is not None
    assert l2.current_term > l1.current_term

    # l2 proposes valid commands and commits them across majority [f1, f2]
    l2.propose(["put", "canonical", "value2"])
    cluster.run_until(
        lambda c: c.nodes[f1_id].commit_index >= 1 and c.nodes[f2_id].commit_index >= 1,
        max_ticks=100,
    )

    # Now heal the partition: l1 rejoins, discovers l2's higher term, truncates its conflicting entry
    cluster.heal_network()
    cluster.run_until(lambda c: all(n.commit_index >= 1 for n in c.nodes.values()), max_ticks=100)

    # All nodes must have canonical value and NOT abandoned value
    for nid in cluster.node_ids:
        assert cluster.state_machines[nid].get("canonical") == "value2"
        assert cluster.state_machines[nid].get("abandoned") is None


def test_stress_replication_with_unreliable_network_and_seeds():
    """Verify invariants hold across diverse seeds with network drops and delays."""
    for seed in range(25):
        net_cfg = NetworkConfig(min_latency=1, max_latency=3, drop_rate=0.08)
        cluster = SimulationCluster(node_ids=[0, 1, 2], seed=seed, network_config=net_cfg)
        leader = cluster.run_until_leader(max_ticks=100)
        if leader is not None:
            try:
                cluster.propose(["put", f"s{seed}", seed])
            except NotLeaderError:
                pass
        cluster.step(ticks=60)
        # Invariants (Election Safety, Log Matching, Commit Safety, Leader Completeness)
        # are automatically checked on every step by cluster.step().
