"""Tests for Raft leader election and safety invariants."""


from systems.aether_quorum_db.raft.events import Role
from systems.aether_quorum_db.simulation.cluster import SimulationCluster
from systems.aether_quorum_db.simulation.network import NetworkConfig


def test_should_elect_single_node_immediately():
    cluster = SimulationCluster(node_ids=[0], seed=1)
    leader = cluster.run_until_leader(max_ticks=50)

    assert leader is not None
    assert leader.node_id == 0
    assert leader.role is Role.LEADER
    assert leader.current_term == 1


def test_should_elect_leader_in_three_node_cluster():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=42)
    leader = cluster.run_until_leader(max_ticks=100)

    assert leader is not None
    assert leader.role is Role.LEADER

    # Step to allow initial heartbeats to reach all followers across network latency
    cluster.step(ticks=10)

    followers = [n for n in cluster.nodes.values() if n.node_id != leader.node_id]
    for follower in followers:
        assert follower.role is Role.FOLLOWER
        assert follower.current_term == leader.current_term
        assert follower.leader_id == leader.node_id


def test_election_safety_across_many_seeds():
    """Verify that across many seeds with varying network latency, no term has 2 leaders."""
    for seed in range(50):
        net_cfg = NetworkConfig(min_latency=1, max_latency=4, drop_rate=0.05)
        cluster = SimulationCluster(node_ids=[0, 1, 2], seed=seed, network_config=net_cfg)
        cluster.step(ticks=80)
        # Invariants are checked at each step. If no InvariantViolation raised, test passes.


def test_should_elect_new_leader_when_current_leader_crashes():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=123)
    old_leader = cluster.run_until_leader(max_ticks=100)
    assert old_leader is not None
    old_leader_id = old_leader.node_id
    old_term = old_leader.current_term

    # Crash the leader
    cluster.crash_node(old_leader_id)

    # Remaining 2 nodes form majority (2/3) and should elect a new leader
    def has_new_leader(c: SimulationCluster) -> bool:
        leaders = [
            n for n in c.nodes.values()
            if n.node_id in c.running_nodes and n.role is Role.LEADER
        ]
        return len(leaders) == 1 and leaders[0].current_term > old_term

    assert cluster.run_until(has_new_leader, max_ticks=200)
    new_leader = cluster.leader
    assert new_leader is not None
    assert new_leader.node_id != old_leader_id
    assert new_leader.current_term > old_term


def test_should_step_down_when_restarted_leader_sees_higher_term():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=777)
    old_leader = cluster.run_until_leader(max_ticks=100)
    assert old_leader is not None
    old_leader_id = old_leader.node_id

    # Crash leader, let remainder elect new leader
    cluster.crash_node(old_leader_id)
    assert cluster.run_until_leader(max_ticks=200) is not None

    # Restart old leader
    restarted = cluster.restart_node(old_leader_id)
    assert restarted.role is Role.FOLLOWER

    # Step so it receives heartbeats from the new leader
    cluster.step(ticks=30)
    assert restarted.role is Role.FOLLOWER
    assert restarted.leader_id == cluster.leader.node_id
    assert restarted.current_term == cluster.leader.current_term


def test_minority_partition_cannot_elect_leader():
    # 5 nodes cluster: [0, 1] minority, [2, 3, 4] majority
    cluster = SimulationCluster(node_ids=[0, 1, 2, 3, 4], seed=99)
    cluster.run_until_leader(max_ticks=100)

    # Create network partition
    cluster.partition([[0, 1], [2, 3, 4]])

    # Crash existing leader if it was in the majority so we test election in minority
    cluster.step(ticks=150)

    # In the minority partition [0, 1], no node can become leader
    for node_id in [0, 1]:
        assert cluster.nodes[node_id].role is not Role.LEADER
