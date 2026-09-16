"""Probabilistic Bloom Filter for skipping disk reads on absent keys."""

from __future__ import annotations

import hashlib
import math
import struct
from typing import Any, Dict


class BloomFilter:
    """Space-efficient probabilistic filter providing O(k) membership testing."""

    def __init__(self, expected_elements: int = 1000, false_positive_rate: float = 0.01):
        self.expected_elements = max(1, expected_elements)
        self.fp_rate = false_positive_rate

        # Calculate optimal size (m) and optimal hash count (k)
        # m = - (n * ln(p)) / (ln(2)^2)
        # k = (m / n) * ln(2)
        n = self.expected_elements
        p = self.fp_rate
        m = int(- (n * math.log(p)) / (math.log(2) ** 2))
        # Ensure m is a multiple of 8 (whole bytes) and at least 64 bits
        m = max(64, ((m + 7) // 8) * 8)
        k = max(1, int((m / n) * math.log(2)))

        self.m_bits = m
        self.k_hashes = k
        self.bitarray = bytearray(self.m_bits // 8)
        self.elements_count = 0

    def _hashes(self, key: bytes):
        """Generates k distinct bit indices using double-hashing technique."""
        # Compute SHA-256 and unpack two 64-bit integer seeds (h1 and h2)
        digest = hashlib.sha256(key).digest()
        h1, h2 = struct.unpack("<QQ", digest[:16])

        # Kirsch-Mitzenmacher optimization: gi(x) = (h1 + i * h2) mod m
        for i in range(self.k_hashes):
            yield (h1 + i * h2) % self.m_bits

    def add(self, key: bytes) -> None:
        """Adds a key to the filter by setting k bits."""
        for bit_idx in self._hashes(key):
            byte_idx = bit_idx // 8
            bit_offset = bit_idx % 8
            self.bitarray[byte_idx] |= (1 << bit_offset)
        self.elements_count += 1

    def contains(self, key: bytes) -> bool:
        """Tests if key might be in the filter.

        Never returns false negatives.
        May return false positives at approximately fp_rate probability.
        """
        for bit_idx in self._hashes(key):
            byte_idx = bit_idx // 8
            bit_offset = bit_idx % 8
            if not (self.bitarray[byte_idx] & (1 << bit_offset)):
                return False
        return True

    def count_set_bits(self) -> int:
        """Counts total number of 1-bits currently set in the filter."""
        return sum(bin(byte).count("1") for byte in self.bitarray)

    def to_bytes(self) -> bytes:
        """Serializes the filter to bytes for disk persistence.

        Header:
        <II : m_bits (4B), k_hashes (4B)
        Followed by raw bitarray bytes.
        """
        header = struct.pack("<II", self.m_bits, self.k_hashes)
        return header + bytes(self.bitarray)

    @classmethod
    def from_bytes(cls, data: bytes) -> BloomFilter:
        """Deserializes a BloomFilter from disk bytes."""
        m_bits, k_hashes = struct.unpack_from("<II", data, 0)
        bf = cls.__new__(cls)
        bf.m_bits = m_bits
        bf.k_hashes = k_hashes
        bf.expected_elements = max(1, int(m_bits * math.log(2) / max(1, k_hashes)))
        bf.fp_rate = 0.01
        bf.elements_count = 0
        bf.bitarray = bytearray(data[8 : 8 + (m_bits // 8)])
        return bf

    def export_stats(self) -> Dict[str, Any]:
        """Telemetry statistics for dashboard visualization."""
        set_bits = self.count_set_bits()
        density = (set_bits / max(1, self.m_bits)) * 100.0
        return {
            "m_bits": self.m_bits,
            "m_bytes": len(self.bitarray),
            "k_hashes": self.k_hashes,
            "set_bits": set_bits,
            "density_pct": round(density, 2),
            "theoretical_fp_rate": self.fp_rate,
        }
