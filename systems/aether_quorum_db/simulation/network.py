"""Simulated unreliable network with latency, loss, duplication and partitions.

Every random decision comes from an injected ``random.Random`` so a given seed
always yields the exact same sequence of deliveries.
"""

from __future__ import annotations

import heapq
import random
from collections.abc import Hashable, Iterable
from dataclasses import dataclass, field
from typing import Generic, Protocol, TypeVar


class Addressed(Protocol):
    @property
    def source(self) -> Hashable: ...

    @property
    def target(self) -> Hashable: ...


EnvelopeT = TypeVar("EnvelopeT", bound=Addressed)


@dataclass
class NetworkConfig:
    min_latency: int = 1
    max_latency: int = 3
    drop_rate: float = 0.0
    duplicate_rate: float = 0.0

    def __post_init__(self) -> None:
        if not 1 <= self.min_latency <= self.max_latency:
            raise ValueError("latency bounds must satisfy 1 <= min_latency <= max_latency")
        for name in ("drop_rate", "duplicate_rate"):
            if not 0.0 <= getattr(self, name) <= 1.0:
                raise ValueError(f"{name} must be within [0, 1]")


@dataclass
class NetworkStats:
    sent: int = 0
    delivered: int = 0
    dropped: int = 0
    duplicated: int = 0
    blocked: int = 0


@dataclass(order=True)
class _InFlight(Generic[EnvelopeT]):
    deliver_at: int
    sequence: int
    envelope: EnvelopeT = field(compare=False)


class SimulatedNetwork(Generic[EnvelopeT]):
    """Priority queue of in-flight messages ordered by delivery time.

    Random latency per message naturally produces reordering. Partitions are
    checked both at send time and at delivery time, so messages already in
    flight when a partition starts are lost as well.
    """

    def __init__(self, rng: random.Random, config: NetworkConfig | None = None) -> None:
        self._rng = rng
        self.config = config or NetworkConfig()
        self.stats = NetworkStats()
        self._queue: list[_InFlight[EnvelopeT]] = []
        self._sequence = 0
        self._group_of: dict[Hashable, int] = {}

    # ---- Topology -------------------------------------------------------

    def partition(self, groups: Iterable[Iterable[Hashable]]) -> None:
        """Split nodes into groups that can only talk internally.

        Nodes not listed in any group share an implicit default group.
        """
        self._group_of = {}
        for index, group in enumerate(groups):
            for node in group:
                self._group_of[node] = index

    def heal(self) -> None:
        self._group_of = {}

    def is_connected(self, a: Hashable, b: Hashable) -> bool:
        return self._group_of.get(a, -1) == self._group_of.get(b, -1)

    @property
    def partitions(self) -> list[list[Hashable]]:
        groups: dict[int, list[Hashable]] = {}
        for node, group in self._group_of.items():
            groups.setdefault(group, []).append(node)
        return [groups[key] for key in sorted(groups)]

    # ---- Traffic --------------------------------------------------------

    def send(self, envelope: EnvelopeT, now: int) -> None:
        self.stats.sent += 1
        if not self.is_connected(envelope.source, envelope.target):
            self.stats.blocked += 1
            return
        if self._rng.random() < self.config.drop_rate:
            self.stats.dropped += 1
            return
        self._enqueue(envelope, now)
        if self._rng.random() < self.config.duplicate_rate:
            self.stats.duplicated += 1
            self._enqueue(envelope, now)

    def deliver_due(self, now: int) -> list[EnvelopeT]:
        delivered: list[EnvelopeT] = []
        while self._queue and self._queue[0].deliver_at <= now:
            item = heapq.heappop(self._queue)
            if not self.is_connected(item.envelope.source, item.envelope.target):
                self.stats.blocked += 1
                continue
            self.stats.delivered += 1
            delivered.append(item.envelope)
        return delivered

    def in_flight(self) -> list[tuple[int, EnvelopeT]]:
        return [(item.deliver_at, item.envelope) for item in sorted(self._queue)]

    def _enqueue(self, envelope: EnvelopeT, now: int) -> None:
        latency = self._rng.randint(self.config.min_latency, self.config.max_latency)
        self._sequence += 1
        heapq.heappush(self._queue, _InFlight(now + latency, self._sequence, envelope))
