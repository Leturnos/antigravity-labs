"""Unit tests for Write-Ahead Log (WAL) and crash recovery."""

import tempfile
import unittest
from pathlib import Path

from backend.aether_storage_internals.engine.types import CorruptRecordError, Record
from backend.aether_storage_internals.engine.wal import WriteAheadLog


class TestWriteAheadLog(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.wal_path = Path(self.temp_dir.name) / "test.wal"
        self.wal = WriteAheadLog(self.wal_path, sync_on_write=True)

    def tearDown(self):
        self.wal.close()
        self.temp_dir.cleanup()

    def test_append_and_read(self):
        rec1 = Record(key=b"k1", value=b"val1")
        rec2 = Record(key=b"k2", value=b"val2", is_tombstone=True)

        self.wal.append(rec1)
        self.wal.append(rec2)
        self.wal.close()

        records, corrupted_bytes = WriteAheadLog.read_all(self.wal_path)
        self.assertEqual(len(records), 2)
        self.assertEqual(corrupted_bytes, 0)
        self.assertEqual(records[0].key, b"k1")
        self.assertEqual(records[0].value, b"val1")
        self.assertTrue(records[1].is_tombstone)

    def test_crash_recovery_truncated_tail(self):
        rec1 = Record(key=b"k1", value=b"val1")
        rec2 = Record(key=b"k2", value=b"val2")
        self.wal.append(rec1)
        self.wal.append(rec2)
        self.wal.close()

        # Simulate power failure during 3rd write by appending incomplete bytes
        with open(self.wal_path, "ab") as f:
            f.write(b"\x00\x01\x02\x03\x04\x05")  # Corrupted partial header

        records, corrupted_bytes = WriteAheadLog.read_all(self.wal_path, truncate_corrupted_tail=True)
        self.assertEqual(len(records), 2)
        self.assertEqual(corrupted_bytes, 6)

        # Ensure file was truncated and clean
        records_after, corrupt_after = WriteAheadLog.read_all(self.wal_path)
        self.assertEqual(len(records_after), 2)
        self.assertEqual(corrupt_after, 0)


if __name__ == "__main__":
    unittest.main()
