"""Write-Ahead Log (WAL) implementation for crash resilience and instant recovery."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Generator, List, Optional, Tuple

from .types import CorruptRecordError, Record


class WriteAheadLog:
    """Manages an append-only binary Write-Ahead Log file on disk."""

    def __init__(self, filepath: Path, sync_on_write: bool = True):
        self.filepath = filepath
        self.sync_on_write = sync_on_write
        self._file = None
        self._bytes_written = 0
        self._records_count = 0
        self._open_append()

    def _open_append(self) -> None:
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        # Open in append + binary mode
        self._file = open(self.filepath, "ab")
        self._bytes_written = self.filepath.stat().st_size if self.filepath.exists() else 0

    @property
    def file_size(self) -> int:
        if self._file and not self._file.closed:
            return self._file.tell()
        if self.filepath.exists():
            return self.filepath.stat().st_size
        return 0

    @property
    def records_count(self) -> int:
        return self._records_count

    def append(self, record: Record) -> int:
        """Appends a record to the WAL file.

        Returns the number of bytes written.
        """
        if self._file is None or self._file.closed:
            self._open_append()

        encoded = record.encode()
        self._file.write(encoded)
        if self.sync_on_write:
            self._file.flush()
            os.fsync(self._file.fileno())
        else:
            self._file.flush()

        written = len(encoded)
        self._bytes_written += written
        self._records_count += 1
        return written

    def sync(self) -> None:
        """Forces an OS fsync to flush kernel page caches to storage hardware."""
        if self._file and not self._file.closed:
            self._file.flush()
            os.fsync(self._file.fileno())

    def close(self) -> None:
        """Closes the current WAL file."""
        if self._file and not self._file.closed:
            self.sync()
            self._file.close()
            self._file = None

    def delete(self) -> None:
        """Closes and unlinks the WAL file from disk."""
        self.close()
        if self.filepath.exists():
            try:
                self.filepath.unlink()
            except OSError:
                pass

    @classmethod
    def read_all(cls, filepath: Path, truncate_corrupted_tail: bool = True) -> Tuple[List[Record], int]:
        """Reads and validates all records from a WAL file.

        Returns (records, corrupted_bytes_discarded).
        If truncate_corrupted_tail is True, truncates any trailing corrupted bytes
        resulting from an abrupt power failure.
        """
        records: List[Record] = []
        if not filepath.exists():
            return records, 0

        with open(filepath, "rb") as f:
            data = f.read()

        offset = 0
        total_len = len(data)
        corrupted_bytes = 0

        while offset < total_len:
            try:
                record, bytes_read = Record.decode(data, offset)
                records.append(record)
                offset += bytes_read
            except (EOFError, CorruptRecordError):
                # A partial or corrupted write was reached at the tail of the log
                corrupted_bytes = total_len - offset
                break

        if corrupted_bytes > 0 and truncate_corrupted_tail:
            with open(filepath, "r+b") as f:
                f.truncate(offset)

        return records, corrupted_bytes
