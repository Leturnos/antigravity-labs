"""Integration tests for distributed SQL replication, consensus, and state machine consistency."""

import pytest

from systems.aether_quorum_db.replication.sql_state_machine import (
    NonDeterministicError,
    SqlStateMachine,
)
from systems.aether_quorum_db.simulation.cluster import SimulationCluster


def test_distributed_sql_ddl_and_dml_replication():
    cluster = SimulationCluster(
        node_ids=[0, 1, 2],
        seed=42,
        state_machine_factory=SqlStateMachine,
    )
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None

    # DDL
    cluster.execute_sql("CREATE TABLE accounts (id INT PRIMARY KEY, name TEXT, balance INT);")

    # DML
    cluster.execute_sql("INSERT INTO accounts (id, name, balance) VALUES (1, 'Alice', 1000), (2, 'Bob', 500);")
    cluster.execute_sql("UPDATE accounts SET balance = 1200 WHERE id = 1;")
    cluster.execute_sql("INSERT INTO accounts (id, name, balance) VALUES (3, 'Charlie', 300);")
    cluster.execute_sql("DELETE FROM accounts WHERE id = 2;")

    # Allow followers to process any trailing commits
    cluster.step(ticks=20)

    # Verify that all 3 nodes have identical database state checksums!
    checksums = cluster.get_state_checksums()
    assert len(set(checksums.values())) == 1, f"State divergence detected: {checksums}"

    # Linearizable read query
    res = cluster.execute_sql("SELECT id, name, balance FROM accounts ORDER BY id ASC;")
    assert res.rows == [(1, "Alice", 1200), (3, "Charlie", 300)]


def test_non_deterministic_functions_rejected_by_state_machine():
    cluster = SimulationCluster(
        node_ids=[0, 1, 2],
        seed=10,
        state_machine_factory=SqlStateMachine,
    )
    cluster.run_until_leader(max_ticks=100)

    cluster.execute_sql("CREATE TABLE events (id INT PRIMARY KEY, ts TEXT);")

    with pytest.raises(NonDeterministicError) as exc_info:
        cluster.execute_sql("INSERT INTO events (id, ts) VALUES (1, NOW());")
    assert "Non-deterministic functions are prohibited" in str(exc_info.value)


def test_distributed_sql_under_leader_crash():
    cluster = SimulationCluster(
        node_ids=[0, 1, 2],
        seed=99,
        state_machine_factory=SqlStateMachine,
    )
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None
    leader_id = leader.node_id

    # Create table and initial data
    cluster.execute_sql("CREATE TABLE inventory (item_id INT PRIMARY KEY, qty INT);")
    cluster.execute_sql("INSERT INTO inventory (item_id, qty) VALUES (10, 100), (20, 200);")

    # Crash the leader!
    cluster.crash_node(leader_id)

    # Remainder of cluster elects a new leader
    new_leader = cluster.run_until_leader(max_ticks=150)
    assert new_leader is not None
    assert new_leader.node_id != leader_id

    # Perform more writes on new leader
    cluster.execute_sql("INSERT INTO inventory (item_id, qty) VALUES (30, 300);")
    cluster.execute_sql("UPDATE inventory SET qty = 150 WHERE item_id = 10;")

    # Restart crashed old leader
    cluster.restart_node(leader_id)
    cluster.run_until(lambda c: c.nodes[leader_id].commit_index == c.leader.commit_index, max_ticks=150)

    # Let state machines apply
    cluster.step(ticks=20)

    # All nodes must have identical state checksums
    checksums = cluster.get_state_checksums()
    assert len(set(checksums.values())) == 1, f"Checksum mismatch after recovery: {checksums}"

    # Verify query result
    res = cluster.execute_sql("SELECT item_id, qty FROM inventory ORDER BY item_id ASC;")
    assert res.rows == [(10, 150), (20, 200), (30, 300)]


def test_distributed_sql_snapshot_compaction_and_catchup():
    cluster = SimulationCluster(
        node_ids=[0, 1, 2],
        seed=777,
        state_machine_factory=SqlStateMachine,
    )
    leader = cluster.run_until_leader(max_ticks=100)
    assert leader is not None
    leader_id = leader.node_id

    followers = [n for n in cluster.node_ids if n != leader_id]
    slow_follower_id = followers[0]

    cluster.execute_sql("CREATE TABLE ledger (id INT PRIMARY KEY, val INT);")

    # Crash slow follower
    cluster.crash_node(slow_follower_id)

    # Write multiple rows on remaining majority
    for i in range(10):
        cluster.execute_sql(f"INSERT INTO ledger (id, val) VALUES ({i}, {i * 10});")

    # Force leader to compact log up to index 8
    cluster.compact_log(leader_id, up_to_index=8)
    assert cluster.nodes[leader_id].log.last_included_index >= 8

    # Restart slow follower: leader sends InstallSnapshot containing complete DB state
    cluster.restart_node(slow_follower_id)
    cluster.run_until(
        lambda c: c.nodes[slow_follower_id].commit_index == c.leader.commit_index,
        max_ticks=200,
    )

    cluster.step(ticks=20)

    # Verify identical checksums across all nodes
    checksums = cluster.get_state_checksums()
    assert len(set(checksums.values())) == 1, f"Checksum mismatch after InstallSnapshot: {checksums}"

    # Verify query on slow follower matches
    sm_slow = cluster.state_machines[slow_follower_id]
    res = sm_slow.query("SELECT COUNT(*) FROM ledger;")
    assert res.rows == [(10,)]
