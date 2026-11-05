"""SSTable Writer and Reader with Data Blocks, Sparse Index, Bloom Filter, and Footer."""

from __future__ import annotations

import bisect
import os
import struct
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from .bloom_filter import BloomFilter
from .types import (
    FOOTER_FORMAT,
    FOOTER_SIZE,
    SSTABLE_MAGIC,
    Record,
    SSTableMeta,
)


class SSTableWriter:
    """Writes an immutable Sorted String Table to disk with Sparse Index and Bloom Filter."""

    def __init__(self, filepath: Path, index_interval: int = 16, fp_rate: float = 0.01):
        self.filepath = filepath
        self.index_interval = index_interval
        self.fp_rate = fp_rate

    def write_records(self, records: List[Record], level: int = 0) -> SSTableMeta:
        """Writes sorted records into the SSTable file.

        The records MUST be sorted in ascending lexicographical key order.
        """
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        record_count = len(records)
        if record_count == 0:
            raise ValueError("Cannot write empty SSTable")

        bloom_filter = BloomFilter(expected_elements=record_count, false_positive_rate=self.fp_rate)
        sparse_index: List[Tuple[bytes, int]] = []

        with open(self.filepath, "wb") as f:
            data_offset = 0

            # 1. Write Data Block
            for i, rec in enumerate(records):
                # Sample sparse index every index_interval records
                if i % self.index_interval == 0:
                    sparse_index.append((rec.key, data_offset))

                bloom_filter.add(rec.key)

                encoded = rec.encode()
                f.write(encoded)
                data_offset += len(encoded)

            data_block_len = data_offset

            # 2. Write Sparse Index Block
            index_offset = f.tell()
            # Index format: <I (num_entries), then for each: <HQ (key_len, offset), then key_bytes
            f.write(struct.pack("<I", len(sparse_index)))
            for k, off in sparse_index:
                f.write(struct.pack("<HQ", len(k), off))
                f.write(k)
            index_len = f.tell() - index_offset

            # 3. Write Bloom Filter Block
            filter_offset = f.tell()
            filter_bytes = bloom_filter.to_bytes()
            f.write(filter_bytes)
            filter_len = len(filter_bytes)

            # 4. Write Fixed 32-Byte Footer
            footer_bytes = struct.pack(
                FOOTER_FORMAT,
                index_offset,
                index_len,
                filter_offset,
                filter_len,
                record_count,
                SSTABLE_MAGIC,
            )
            f.write(footer_bytes)
            f.flush()
            os.fsync(f.fileno())

            total_size = f.tell()

        file_id = self.filepath.stem
        min_key = records[0].key.decode("utf-8", errors="replace")
        max_key = records[-1].key.decode("utf-8", errors="replace")

        return SSTableMeta(
            file_id=file_id,
            level=level,
            file_path=str(self.filepath),
            file_size=total_size,
            record_count=record_count,
            min_key=min_key,
            max_key=max_key,
        )


class SSTableReader:
    """Reads and queries an immutable SSTable using Bloom Filter and Sparse Index."""

    def __init__(self, filepath: Path, level: int = 0):
        self.filepath = filepath
        self.level = level
        self._file_size = filepath.stat().st_size
        self._index_offset = 0
        self._index_len = 0
        self._filter_offset = 0
        self._filter_len = 0
        self._record_count = 0
        self._sparse_index_keys: List[bytes] = []
        self._sparse_index_offsets: List[int] = []
        self._bloom_filter: Optional[BloomFilter] = None
        self.min_key = ""
        self.max_key = ""

        self._load_metadata()

    @property
    def file_id(self) -> str:
        return self.filepath.stem

    @property
    def file_size(self) -> int:
        return self._file_size

    @property
    def record_count(self) -> int:
        return self._record_count

    @property
    def bloom_filter(self) -> Optional[BloomFilter]:
        return self._bloom_filter

    def _load_metadata(self) -> None:
        """Parses the Footer, Sparse Index, and Bloom Filter from disk."""
        if self._file_size < FOOTER_SIZE:
            raise ValueError(f"Corrupt SSTable: file size {self._file_size} is smaller than footer size")

        with open(self.filepath, "rb") as f:
            # 1. Read Footer
            f.seek(self._file_size - FOOTER_SIZE)
            footer_data = f.read(FOOTER_SIZE)
            (
                self._index_offset,
                self._index_len,
                self._filter_offset,
                self._filter_len,
                self._record_count,
                magic,
            ) = struct.unpack(FOOTER_FORMAT, footer_data)

            if magic != SSTABLE_MAGIC:
                raise ValueError(f"Invalid SSTable magic: expected {SSTABLE_MAGIC!r}, got {magic!r}")

            # 2. Read Bloom Filter
            f.seek(self._filter_offset)
            filter_data = f.read(self._filter_len)
            self._bloom_filter = BloomFilter.from_bytes(filter_data)

            # 3. Read Sparse Index
            f.seek(self._index_offset)
            index_count = struct.unpack("<I", f.read(4))[0]
            self._sparse_index_keys = []
            self._sparse_index_offsets = []

            for _ in range(index_count):
                k_len, off = struct.unpack("<HQ", f.read(10))
                k = f.read(k_len)
                self._sparse_index_keys.append(k)
                self._sparse_index_offsets.append(off)

            # 4. Read first and last record to identify min_key and max_key
            if self._sparse_index_keys:
                self.min_key = self._sparse_index_keys[0].decode("utf-8", errors="replace")

            # Determine max_key by reading the very last record in the data block
            f.seek(0)
            data_block_len = self._index_offset
            # If records exist, read the data block records or get from index
            if self._sparse_index_offsets:
                # Seek to last indexed offset and scan to end of data block
                last_off = self._sparse_index_offsets[-1]
                f.seek(last_off)
                last_data = f.read(data_block_len - last_off)
                off = 0
                last_rec = None
                while off < len(last_data):
                    rec, r_len = Record.decode(last_data, off)
                    last_rec = rec
                    off += r_len
                if last_rec:
                    self.max_key = last_rec.key.decode("utf-8", errors="replace")

    def get(self, key: bytes) -> Tuple[Optional[Record], Dict[str, Any]]:
        """Point lookup for key.

        Returns (Record or None, telemetry_details).
        """
        telemetry = {
            "bloom_checked": True,
            "bloom_matched": False,
            "sparse_index_used": False,
            "data_block_read": False,
            "records_scanned": 0,
            "disk_read_avoided": False,
        }

        # Step 1: Bloom Filter Check
        if self._bloom_filter and not self._bloom_filter.contains(key):
            # Key definitively does not exist in this SSTable! Disk read avoided!
            telemetry["disk_read_avoided"] = True
            return None, telemetry

        telemetry["bloom_matched"] = True

        # Step 2: Binary Search in Sparse Index
        # Find index i where sparse_index_keys[i] <= key < sparse_index_keys[i+1]
        idx = bisect.bisect_right(self._sparse_index_keys, key) - 1
        if idx < 0:
            idx = 0

        start_offset = self._sparse_index_offsets[idx]
        if idx + 1 < len(self._sparse_index_offsets):
            end_offset = self._sparse_index_offsets[idx + 1]
        else:
            end_offset = self._index_offset

        telemetry["sparse_index_used"] = True
        telemetry["data_block_read"] = True

        # Step 3: Read candidate block from disk
        with open(self.filepath, "rb") as f:
            f.seek(start_offset)
            block_data = f.read(end_offset - start_offset)

        # Step 4: Scan candidate records
        curr_offset = 0
        while curr_offset < len(block_data):
            rec, bytes_read = Record.decode(block_data, curr_offset)
            telemetry["records_scanned"] += 1
            curr_offset += bytes_read

            if rec.key == key:
                return rec, telemetry
            if rec.key > key:
                # Key passed, does not exist
                break

        return None, telemetry

    def read_all_records(self) -> List[Record]:
        """Reads all records in the SSTable Data Block (for compaction and inspection)."""
        records: List[Record] = []
        with open(self.filepath, "rb") as f:
            f.seek(0)
            data_bytes = f.read(self._index_offset)

        offset = 0
        total_len = len(data_bytes)
        while offset < total_len:
            rec, bytes_read = Record.decode(data_bytes, offset)
            records.append(rec)
            offset += bytes_read

        return records

    def scan(
        self,
        start_key: Optional[bytes] = None,
        end_key: Optional[bytes] = None,
    ) -> Iterator[Record]:
        """Iterates over records in range [start_key, end_key)."""
        for rec in self.read_all_records():
            if start_key is not None and rec.key < start_key:
                continue
            if end_key is not None and rec.key >= end_key:
                break
            yield rec

    def inspect_layout(self) -> Dict[str, Any]:
        """Returns byte offsets and section definitions for the visual Hex Dump Inspector."""
        return {
            "file_id": self.file_id,
            "level": self.level,
            "file_size": self._file_size,
            "sections": [
                {
                    "name": "Data Block",
                    "start_offset": 0,
                    "end_offset": self._index_offset,
                    "length": self._index_offset,
                    "description": f"Sequential binary records ({self._record_count} items)",
                    "tag": "data",
                },
                {
                    "name": "Sparse Index Block",
                    "start_offset": self._index_offset,
                    "end_offset": self._filter_offset,
                    "length": self._index_len,
                    "description": f"Sampled key offsets ({len(self._sparse_index_keys)} samples)",
                    "tag": "index",
                },
                {
                    "name": "Bloom Filter Block",
                    "start_offset": self._filter_offset,
                    "end_offset": self._file_size - FOOTER_SIZE,
                    "length": self._filter_len,
                    "description": f"Bitarray filter ({self._bloom_filter.m_bits if self._bloom_filter else 0} bits, {self._bloom_filter.k_hashes if self._bloom_filter else 0} hashes)",
                    "tag": "filter",
                },
                {
                    "name": "SSTable Footer",
                    "start_offset": self._file_size - FOOTER_SIZE,
                    "end_offset": self._file_size,
                    "length": FOOTER_SIZE,
                    "description": f"Fixed 32-byte header with magic 'AETH' and offsets",
                    "tag": "footer",
                },
            ],
            "record_count": self._record_count,
            "min_key": self.min_key,
            "max_key": self.max_key,
            "sparse_index_samples": [
                {"key": k.decode("utf-8", errors="replace"), "offset": off}
                for k, off in zip(self._sparse_index_keys, self._sparse_index_offsets)
            ],
            "bloom_stats": self._bloom_filter.export_stats() if self._bloom_filter else {},
        }
