"""Virtual time source for the deterministic simulation."""

from __future__ import annotations


class VirtualClock:
    """Discrete logical clock; time only moves when the simulation advances it."""

    def __init__(self) -> None:
        self._now = 0

    @property
    def now(self) -> int:
        return self._now

    def advance(self, ticks: int = 1) -> int:
        if ticks < 0:
            raise ValueError(f"cannot move time backwards (ticks={ticks})")
        self._now += ticks
        return self._now
