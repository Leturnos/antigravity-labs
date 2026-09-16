"""End-to-End integration tests for LSMTreeEngine."""

import tempfile
import unittest
from pathlib import Path

from backend.aether_storage_internals.engine.lsm_tree import LSMTreeEngine


class TestLSMTreeEngine(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self.engine = LSMTreeEngine(
            data_dir=self.data_dir,
            memtable_threshold_bytes=1024,  # Small threshold for fast flushes
            l0_compaction_threshold=3,
        )

    def tearDown(self):
        self.engine.close()
        self.temp_dir.cleanup()

    def test_put_get_delete(self):
        self.engine.put("user:alice", "developer")
        self.engine.put("user:bob", "designer")

        # GET
        res_alice = self.engine.get("user:alice")
        self.assertIsNotNone(res_alice)
        self.assertEqual(res_alice.value_str, "developer")

        # DELETE (Tombstone)
        self.engine.delete("user:alice")
        self.assertIsNone(self.engine.get("user:alice"))

    def test_flush_and_compaction_flow(self):
        # Insert enough records to trigger flushes and compaction
        for i in range(120):
            self.engine.put(f"sensor:{i:04d}", f"reading_val_{i:06d}")

        state = self.engine.get_state()
        total_sstables = sum(len(readers) for readers in state["levels"].values())
        self.assertGreater(total_sstables, 0)

        # Ensure all records are intact and queryable across SSTables
        for i in range(120):
            rec = self.engine.get(f"sensor:{i:04d}")
            self.assertIsNotNone(rec, f"Missing record sensor:{i:04d}")
            self.assertEqual(rec.value_str, f"reading_val_{i:06d}")

    def test_query_tracer(self):
        self.engine.put("cache:hot_key", "active_in_memtable")
        trace_hot = self.engine.trace_get("cache:hot_key")
        self.assertTrue(trace_hot.found)
        self.assertEqual(trace_hot.steps[0].layer, "active_memtable")
        self.assertTrue(trace_hot.steps[0].hit)

        # Force flush to disk
        self.engine.flush()
        trace_disk = self.engine.trace_get("cache:hot_key")
        self.assertTrue(trace_disk.found)
        # Should miss active memtable and hit L0 SSTable
        self.assertFalse(trace_disk.steps[0].hit)

    def test_crash_and_recovery(self):
        self.engine.put("important_state", "unflushed_data")
        self.engine.put("session_id", "xyz789")

        # Simulate abrupt power failure
        self.engine.simulate_crash()
        self.assertIsNone(self.engine.get("important_state"))

        # Recover from Write-Ahead Log
        report = self.engine.recover()
        self.assertGreaterEqual(report.records_recovered, 2)

        # Verified recovered state
        rec = self.engine.get("important_state")
        self.assertIsNotNone(rec)
        self.assertEqual(rec.value_str, "unflushed_data")


if __name__ == "__main__":
    unittest.main()
