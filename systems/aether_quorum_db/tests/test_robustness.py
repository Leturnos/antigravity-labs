"""Tests for Raft robustness: crash recovery, client deduplication, ReadIndex, and snapshots."""


from systems.aether_quorum_db.raft.events import Role
from systems.aether_quorum_db.raft.node import NotLeaderError
from systems.aether_quorum_db.simulation import faults
from systems.aether_quorum_db.simulation.cluster import SimulationCluster


def test_crash_and_recovery_replays_committed_log():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=42)
    cluster.run_until_leader(max_ticks=100)

    # Propose entries
    for i in range(4):
        cluster.propose(["put", f"k{i}", f"v{i}"])
        cluster.step(ticks=2)
    cluster.run_until(lambda c: all(n.commit_index == 4 for n in c.nodes.values()), max_ticks=50)

    # Crash follower node 1
    cluster.crash_node(1)
    assert not cluster.is_running(1)

    # Propose another entry while node 1 is down
    cluster.propose(["put", "k4", "v4"])
    cluster.step(ticks=20)

    # Restart node 1; it should replay all entries from its log up to commit_index
    cluster.restart_node(1)
    cluster.run_until(lambda c: c.nodes[1].commit_index == 5, max_ticks=100)

    # Verify state machine on node 1 matches
    expected = {f"k{i}": f"v{i}" for i in range(5)}
    assert cluster.state_machines[1].data == expected


def test_client_request_deduplication():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=55)
    cluster.run_until_leader(max_ticks=100)

    # Propose command with client_id and sequence_num
    e1 = cluster.propose(["put", "counter", 100], client_id="client_A", sequence_num=1)
    cluster.run_until(lambda c: all(n.commit_index >= e1.index for n in c.nodes.values()), max_ticks=50)

    initial_log_len = cluster.leader.log.last_index

    # Client retries the identical request (e.g. due to client-side network timeout)
    e2 = cluster.propose(["put", "counter", 100], client_id="client_A", sequence_num=1)

    # Leader must NOT append a duplicate entry to the log
    assert cluster.leader.log.last_index == initial_log_len
    assert e2.sequence_num == 1

    # New sequence number must append and commit normally
    e3 = cluster.propose(["put", "counter", 200], client_id="client_A", sequence_num=2)
    assert e3.index == initial_log_len + 1
    cluster.run_until(lambda c: all(n.commit_index >= e3.index for n in c.nodes.values()), max_ticks=50)
    assert cluster.state_machines[cluster.leader.node_id].get("counter") == 200


def test_linearizable_read_via_read_index():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=77)
    cluster.run_until_leader(max_ticks=100)

    # Write data and commit
    cluster.propose(["put", "user_1", "Alice"])
    cluster.run_until(lambda c: all(n.commit_index >= 1 for n in c.nodes.values()), max_ticks=50)

    # Perform ReadIndex query
    val = cluster.linearizable_read(lambda sm: sm.get("user_1"))
    assert val == "Alice"


def test_read_index_blocked_on_partitioned_leader():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=88)
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None

    cluster.propose(["put", "secret", "initial"])
    cluster.run_until(lambda c: all(n.commit_index >= 1 for n in c.nodes.values()), max_ticks=50)

    # Isolate leader in minority partition
    isolated_id = faults.isolate_leader(cluster)
    assert isolated_id == leader.node_id

    # The isolated leader cannot obtain quorum confirmation for ReadIndex round
    round_id = leader.request_read_index()
    cluster.step(ticks=30)

    # It must not confirm the read
    assert leader.get_ready_read_index(round_id) is None


def test_log_compaction_discards_old_entries():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=101)
    cluster.run_until_leader(max_ticks=100)

    # Propose 6 entries
    for i in range(6):
        cluster.propose(["put", f"key_{i}", i])
        cluster.step(ticks=2)
    cluster.run_until(lambda c: all(n.commit_index == 6 for n in c.nodes.values()), max_ticks=50)

    leader_node = cluster.leader
    assert len(leader_node.storage.entries) == 6

    # Force compaction up to index 4
    cluster.compact_log(leader_node.node_id, up_to_index=4)

    assert leader_node.log.last_included_index == 4
    assert len(leader_node.storage.entries) == 2  # remaining: entries 5 and 6
    assert leader_node.log.last_index == 6
    assert cluster.state_machines[leader_node.node_id].get("key_3") == 3


def test_slow_follower_catches_up_via_install_snapshot():
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=120)
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None
    leader_id = leader.node_id

    follower_ids = [nid for nid in cluster.node_ids if nid != leader_id]
    slow_follower_id = follower_ids[0]

    # Crash slow follower
    cluster.crash_node(slow_follower_id)

    # Remaining 2 nodes (majority) commit 8 commands
    for i in range(8):
        cluster.propose(["put", f"item_{i}", i * 10])
        cluster.step(ticks=2)

    cluster.run_until(
        lambda c: c.nodes[leader_id].commit_index == 8,
        max_ticks=60,
    )

    # Leader compacts its log up to index 6 (discarding entries 1..6)
    cluster.compact_log(leader_id, up_to_index=6)
    assert cluster.nodes[leader_id].log.last_included_index == 6

    # Now restart slow follower! Its next_index on leader is 1, which is <= 6.
    # Leader must send InstallSnapshot to catch it up!
    cluster.restart_node(slow_follower_id)

    # Step to allow InstallSnapshot transmission and subsequent AppendEntries
    cluster.run_until(
        lambda c: c.nodes[slow_follower_id].commit_index == 8,
        max_ticks=150,
    )

    # Slow follower has caught up completely
    assert cluster.nodes[slow_follower_id].commit_index == 8
    expected = {f"item_{i}": i * 10 for i in range(8)}
    assert cluster.state_machines[slow_follower_id].data == expected


def test_chaos_fault_injection_convergence():
    """Verify cluster converges and remains safe under chaotic network and restarts."""
    cluster = SimulationCluster(node_ids=[0, 1, 2], seed=999)
    cluster.run_until_leader(max_ticks=100)

    # Step with flaky network
    faults.flaky_network(cluster, drop_rate=0.2, max_latency=5)
    for i in range(3):
        try:
            cluster.propose(["put", f"chaos_{i}", i])
        except NotLeaderError:
            pass
        cluster.step(ticks=15)

    # Temporarily crash one node
    faults.crash_and_recover(cluster, node_id=1, down_ticks=20)

    # Restore clean network and heal
    faults.reset_network(cluster)
    active_leader = cluster.run_until_leader(max_ticks=200)
    assert active_leader is not None

    # Propose final entry to drive cluster to convergence
    cluster.propose(["put", "final", "done"])
    cluster.run_until(
        lambda c: all(n.commit_index == c.leader.commit_index for n in c.nodes.values() if n.role is not Role.CANDIDATE),
        max_ticks=150,
    )

    # Invariants were checked throughout every step without violation
