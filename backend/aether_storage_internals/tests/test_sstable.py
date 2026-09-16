"""Unit tests for SSTable Writer and Reader with Sparse Index and Bloom Filter."""

import tempfile
import unittest
from pathlib import Path

from backend.aether_storage_internals.engine.sstable import SSTableReader, SSTableWriter
from backend.aether_storage_internals.engine.types import Record


class TestSSTable(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.sst_path = Path(self.temp_dir.name) / "test_sstable.sst"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_write_and_read_sstable(self):
        records = [
            Record(key=f"user:{i:04d}".encode(), value=f"profile_data_{i}".encode())
            for i in range(100)
        ]

        writer = SSTableWriter(self.sst_path, index_interval=8)
        meta = writer.write_records(records, level=0)

        self.assertEqual(meta.record_count, 100)
        self.assertEqual(meta.min_key, "user:0000")
        self.assertEqual(meta.max_key, "user:0099")

        reader = SSTableReader(self.sst_path, level=0)
        self.assertEqual(reader.record_count, 100)

        # 1. Point lookup for existing record
        rec, telemetry = reader.get(b"user:0042")
        self.assertIsNotNone(rec)
        self.assertEqual(rec.value, b"profile_data_42")
        self.assertTrue(telemetry["bloom_matched"])
        self.assertTrue(telemetry["sparse_index_used"])

        # 2. Point lookup for absent key (Bloom filter skips disk read)
        rec_absent, tele_absent = reader.get(b"non_existent_key_9999")
        self.assertIsNone(rec_absent)
        self.assertTrue(tele_absent["disk_read_avoided"])

    def test_inspect_layout(self):
        records = [
            Record(key=b"k1", value=b"v1"),
            Record(key=b"k2", value=b"v2"),
        ]
        writer = SSTableWriter(self.sst_path, index_interval=2)
        writer.write_records(records, level=0)

        reader = SSTableReader(self.sst_path, level=0)
        layout = reader.inspect_layout()

        self.assertEqual(len(layout["sections"]), 4)
        section_tags = [s["tag"] for s in layout["sections"]]
        self.assertEqual(section_tags, ["data", "index", "filter", "footer"])


if __name__ == "__main__":
    unittest.main()
