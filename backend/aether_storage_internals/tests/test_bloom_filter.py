"""Unit tests for BloomFilter probabilistic indexing."""

import unittest
from backend.aether_storage_internals.engine.bloom_filter import BloomFilter


class TestBloomFilter(unittest.TestCase):

    def test_no_false_negatives(self):
        bf = BloomFilter(expected_elements=500, false_positive_rate=0.01)
        keys = [f"key_{i}".encode() for i in range(500)]

        for k in keys:
            bf.add(k)

        # Every added key MUST be detected
        for k in keys:
            self.assertTrue(bf.contains(k), f"False negative for key {k}")

    def test_false_positive_rate(self):
        bf = BloomFilter(expected_elements=1000, false_positive_rate=0.02)
        added_keys = [f"present_{i}".encode() for i in range(1000)]
        for k in added_keys:
            bf.add(k)

        # Test with 2000 absent keys
        false_positives = 0
        test_count = 2000
        for i in range(test_count):
            absent_key = f"absent_{i}".encode()
            if bf.contains(absent_key):
                false_positives += 1

        measured_fp_rate = false_positives / test_count
        # Expected fp rate ~ 0.02, allowing tolerance margin up to 0.05
        self.assertLess(measured_fp_rate, 0.05, f"FP rate too high: {measured_fp_rate}")

    def test_serialization_roundtrip(self):
        bf = BloomFilter(expected_elements=100, false_positive_rate=0.01)
        bf.add(b"item_one")
        bf.add(b"item_two")

        data = bf.to_bytes()
        loaded = BloomFilter.from_bytes(data)

        self.assertEqual(bf.m_bits, loaded.m_bits)
        self.assertEqual(bf.k_hashes, loaded.k_hashes)
        self.assertTrue(loaded.contains(b"item_one"))
        self.assertTrue(loaded.contains(b"item_two"))
        self.assertFalse(loaded.contains(b"item_three"))


if __name__ == "__main__":
    unittest.main()
