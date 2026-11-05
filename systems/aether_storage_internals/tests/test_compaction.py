"""Unit tests for Compaction Engine multi-way merge sort."""

import tempfile
import unittest
from pathlib import Path

from systems.aether_storage_internals.engine.compaction import CompactionEngine
from systems.aether_storage_internals.engine.sstable import SSTableReader, SSTableWriter
from systems.aether_storage_internals.engine.types import Record


class TestCompaction(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.compactor = CompactionEngine(self.dir_path, target_file_size=65536)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_merge_and_deduplicate(self):
        # File 1: k1 (ts=10), k2 (ts=10)
        p1 = self.dir_path / "sstable_L0_1.sst"
        w1 = SSTableWriter(p1)
        w1.write_records([
            Record(key=b"k1", value=b"old_v1", timestamp=10),
            Record(key=b"k2", value=b"val2", timestamp=10),
        ], level=0)

        # File 2: k1 (ts=20 - newer!), k3 (ts=15), k2 tombstone (ts=25)
        p2 = self.dir_path / "sstable_L0_2.sst"
        w2 = SSTableWriter(p2)
        w2.write_records([
            Record(key=b"k1", value=b"new_v1", timestamp=20),
            Record(key=b"k2", value=b"", timestamp=25, is_tombstone=True),
            Record(key=b"k3", value=b"val3", timestamp=15),
        ], level=0)

        r1 = SSTableReader(p1, level=0)
        r2 = SSTableReader(p2, level=0)

        # Compact L0 to L1 (bottom level)
        new_metas, report = self.compactor.compact_levels(
            source_readers=[r1, r2],
            target_readers=[],
            source_level=0,
            target_level=1,
            is_bottom_level=True,  # Should purge k2 tombstone!
        )

        self.assertEqual(len(new_metas), 1)
        self.assertEqual(report.tombstones_purged, 1)

        merged_reader = SSTableReader(Path(new_metas[0].file_path), level=1)
        all_recs = merged_reader.read_all_records()

        # k1 should have new_v1, k3 should have val3, k2 tombstone should be purged
        self.assertEqual(len(all_recs), 2)
        self.assertEqual(all_recs[0].key, b"k1")
        self.assertEqual(all_recs[0].value, b"new_v1")
        self.assertEqual(all_recs[1].key, b"k3")
        self.assertEqual(all_recs[1].value, b"val3")


if __name__ == "__main__":
    unittest.main()
