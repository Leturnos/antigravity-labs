"""Data types, record encodings, and binary layout for Aether Storage Engine."""

from __future__ import annotations

import struct
import time
import zlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# Header binary packing format:
# <  : little-endian
# I  : CRC32 (4 bytes, unsigned 32-bit)
# Q  : Timestamp / Sequence (8 bytes, unsigned 64-bit)
# B  : IsTombstone (1 byte, 0 = active, 1 = tombstone)
# H  : KeyLength (2 bytes, unsigned 16-bit, up to 65535 bytes)
# I  : ValLength (4 bytes, unsigned 32-bit, up to 4GB)
HEADER_FORMAT = "<IQBHI"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)  # 19 bytes

# SSTable Footer format:
# <  : little-endian
# Q  : Index Block Offset (8 bytes)
# I  : Index Block Length (4 bytes)
# Q  : Filter Block Offset (8 bytes)
# I  : Filter Block Length (4 bytes)
# I  : Record Count (4 bytes)
# 4s : Magic Bytes (4 bytes: b"AETH")
FOOTER_FORMAT = "<QIQII4s"
FOOTER_SIZE = struct.calcsize(FOOTER_FORMAT)  # 32 bytes
SSTABLE_MAGIC = b"AETH"


class CorruptRecordError(Exception):
    """Raised when record CRC32 checksum does not match data."""
    pass


@dataclass(slots=True)
class Record:
    """A single key-value record or deletion tombstone in the LSM-Tree."""

    key: bytes
    value: bytes = b""
    timestamp: int = field(default_factory=lambda: int(time.time_ns()))
    is_tombstone: bool = False

    @property
    def key_str(self) -> str:
        return self.key.decode("utf-8", errors="replace")

    @property
    def value_str(self) -> str:
        if self.is_tombstone:
            return "<TOMBSTONE>"
        return self.value.decode("utf-8", errors="replace")

    def encoded_size(self) -> int:
        """Returns the serialized binary size in bytes."""
        return HEADER_SIZE + len(self.key) + len(self.value)

    def calculate_crc(self) -> int:
        """Calculates CRC32 checksum over header payload and key/value data."""
        payload_meta = struct.pack(
            "<QBHI",
            self.timestamp,
            1 if self.is_tombstone else 0,
            len(self.key),
            len(self.value),
        )
        return zlib.crc32(payload_meta + self.key + self.value) & 0xFFFFFFFF

    def encode(self) -> bytes:
        """Serializes the record into its binary format."""
        crc = self.calculate_crc()
        header = struct.pack(
            HEADER_FORMAT,
            crc,
            self.timestamp,
            1 if self.is_tombstone else 0,
            len(self.key),
            len(self.value),
        )
        return header + self.key + self.value

    @classmethod
    def decode(cls, data: bytes, offset: int = 0) -> Tuple[Record, int]:
        """Deserializes a record from bytes starting at offset.

        Returns (Record, bytes_read).
        Raises CorruptRecordError on invalid CRC or EOFError if data is truncated.
        """
        if len(data) - offset < HEADER_SIZE:
            raise EOFError("Truncated header: not enough bytes")

        crc, timestamp, tombstone_int, key_len, val_len = struct.unpack_from(
            HEADER_FORMAT, data, offset
        )

        total_record_len = HEADER_SIZE + key_len + val_len
        if len(data) - offset < total_record_len:
            raise EOFError(
                f"Truncated record body: needed {total_record_len}, got {len(data) - offset}"
            )

        body_offset = offset + HEADER_SIZE
        key = data[body_offset : body_offset + key_len]
        val = data[body_offset + key_len : body_offset + key_len + val_len]

        # Verify CRC32
        payload_meta = struct.pack(
            "<QBHI",
            timestamp,
            tombstone_int,
            key_len,
            val_len,
        )
        expected_crc = zlib.crc32(payload_meta + key + val) & 0xFFFFFFFF
        if crc != expected_crc:
            raise CorruptRecordError(
                f"CRC32 mismatch: expected {expected_crc:#010x}, recorded {crc:#010x}"
            )

        record = cls(
            key=key,
            value=val,
            timestamp=timestamp,
            is_tombstone=(tombstone_int == 1),
        )
        return record, total_record_len


@dataclass
class SSTableMeta:
    """Metadata representing an immutable SSTable on disk."""

    file_id: str
    level: int
    file_path: str
    file_size: int
    record_count: int
    min_key: str
    max_key: str
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_id": self.file_id,
            "level": self.level,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "record_count": self.record_count,
            "min_key": self.min_key,
            "max_key": self.max_key,
            "created_at": self.created_at,
        }


@dataclass
class TraceStep:
    """A step in an observable query trace."""

    layer: str  # active_memtable | frozen_memtable | sstable_bloom | sstable_index | disk_block
    target: str  # Identifier (e.g. "Active MemTable", "SSTable L0_001")
    action: str  # Description of check
    hit: bool  # Whether key was matched
    disk_read_avoided: bool = False
    detail: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "layer": self.layer,
            "target": self.target,
            "action": self.action,
            "hit": self.hit,
            "disk_read_avoided": self.disk_read_avoided,
            "detail": self.detail,
        }


@dataclass
class TraceResult:
    """Complete trace of a GET query through memory and disk layers."""

    key: str
    found: bool
    value: Optional[str]
    is_tombstone: bool
    steps: List[TraceStep]
    duration_ms: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "found": self.found,
            "value": self.value,
            "is_tombstone": self.is_tombstone,
            "steps": [s.to_dict() for s in self.steps],
            "duration_ms": self.duration_ms,
        }


@dataclass
class CompactionReport:
    """Summary of a background compaction operation."""

    source_level: int
    target_level: int
    input_files: List[str]
    output_files: List[str]
    records_merged: int
    tombstones_purged: int
    bytes_before: int
    bytes_after: int
    duration_ms: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_level": self.source_level,
            "target_level": self.target_level,
            "input_files": self.input_files,
            "output_files": self.output_files,
            "records_merged": self.records_merged,
            "tombstones_purged": self.tombstones_purged,
            "bytes_before": self.bytes_before,
            "bytes_after": self.bytes_after,
            "duration_ms": self.duration_ms,
        }


@dataclass
class RecoveryReport:
    """Summary of a crash recovery replay over the Write-Ahead Log."""

    wal_files_scanned: int
    records_recovered: int
    corruptions_encountered: int
    truncated_tail_bytes: int
    duration_ms: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "wal_files_scanned": self.wal_files_scanned,
            "records_recovered": self.records_recovered,
            "corruptions_encountered": self.corruptions_encountered,
            "truncated_tail_bytes": self.truncated_tail_bytes,
            "duration_ms": self.duration_ms,
        }
