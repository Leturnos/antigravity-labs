"""Tests for the deterministic simulation kernel (virtual clock and network)."""

import random
from dataclasses import dataclass

import pytest

from systems.aether_quorum_db.simulation.clock import VirtualClock
from systems.aether_quorum_db.simulation.network import NetworkConfig, SimulatedNetwork


@dataclass(frozen=True)
class Message:
    source: int
    target: int
    payload: int


def run_traffic(seed: int, config: NetworkConfig, ticks: int = 50) -> list[tuple[int, Message]]:
    network = SimulatedNetwork(random.Random(seed), config)
    clock = VirtualClock()
    log = []
    for tick in range(ticks):
        network.send(Message(source=tick % 3, target=(tick + 1) % 3, payload=tick), clock.now)
        clock.advance()
        log.extend((clock.now, message) for message in network.deliver_due(clock.now))
    return log


def test_should_move_clock_forward_only():
    clock = VirtualClock()
    clock.advance(3)

    assert clock.now == 3
    with pytest.raises(ValueError):
        clock.advance(-1)


def test_should_produce_identical_deliveries_for_same_seed():
    config = NetworkConfig(min_latency=1, max_latency=5, drop_rate=0.2, duplicate_rate=0.1)

    assert run_traffic(seed=42, config=config) == run_traffic(seed=42, config=config)
    assert run_traffic(seed=42, config=config) != run_traffic(seed=7, config=config)


def test_should_respect_latency_bounds():
    network = SimulatedNetwork(random.Random(1), NetworkConfig(min_latency=2, max_latency=4))
    network.send(Message(0, 1, 0), now=10)

    assert network.deliver_due(11) == []
    deliver_at = network.in_flight()[0][0]
    assert 12 <= deliver_at <= 14
    assert network.deliver_due(deliver_at) == [Message(0, 1, 0)]


def test_should_reorder_messages_with_random_latency():
    network = SimulatedNetwork(random.Random(3), NetworkConfig(min_latency=1, max_latency=10))
    for payload in range(30):
        network.send(Message(0, 1, payload), now=0)

    delivered = network.deliver_due(now=10)

    assert sorted(m.payload for m in delivered) == list(range(30))
    assert [m.payload for m in delivered] != list(range(30))


def test_should_drop_everything_when_drop_rate_is_one():
    network = SimulatedNetwork(random.Random(0), NetworkConfig(drop_rate=1.0))
    network.send(Message(0, 1, 0), now=0)

    assert network.deliver_due(now=100) == []
    assert network.stats.dropped == 1


def test_should_duplicate_messages_when_duplicate_rate_is_one():
    network = SimulatedNetwork(random.Random(0), NetworkConfig(duplicate_rate=1.0))
    network.send(Message(0, 1, 0), now=0)

    assert network.deliver_due(now=100) == [Message(0, 1, 0), Message(0, 1, 0)]


def test_should_block_traffic_across_partitions():
    network = SimulatedNetwork(random.Random(0))
    network.partition([[0, 1], [2]])
    network.send(Message(0, 2, 0), now=0)
    network.send(Message(0, 1, 1), now=0)

    assert network.deliver_due(now=100) == [Message(0, 1, 1)]
    assert network.stats.blocked == 1
    assert network.partitions == [[0, 1], [2]]


def test_should_lose_in_flight_messages_when_partition_starts():
    network = SimulatedNetwork(random.Random(0))
    network.send(Message(0, 1, 0), now=0)
    network.partition([[0], [1]])

    assert network.deliver_due(now=100) == []


def test_should_restore_connectivity_after_heal():
    network = SimulatedNetwork(random.Random(0))
    network.partition([[0], [1]])
    network.heal()
    network.send(Message(0, 1, 0), now=0)

    assert network.deliver_due(now=100) == [Message(0, 1, 0)]


def test_should_reject_invalid_config():
    with pytest.raises(ValueError):
        NetworkConfig(min_latency=0)
    with pytest.raises(ValueError):
        NetworkConfig(drop_rate=1.5)
