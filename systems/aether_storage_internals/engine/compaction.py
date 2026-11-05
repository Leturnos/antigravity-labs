"""Background Compaction Engine performing multi-way merge sort and tombstone purging."""

from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .sstable import SSTableReader, SSTableWriter
from .types import CompactionReport, Record, SSTableMeta


class CompactionEngine:
    """Merges multiple overlapping SSTables into dense, non-overlapping SSTables."""

    def __init__(self, data_dir: Path, target_file_size: int = 131072, max_levels: int = 3):
        self.data_dir = data_dir
        self.target_file_size = target_file_size  # Default 128 KB per SSTable
        self.max_levels = max_levels

    def compact_levels(
        self,
        source_readers: List[SSTableReader],
        target_readers: List[SSTableReader],
        source_level: int,
        target_level: int,
        is_bottom_level: bool = False,
    ) -> Tuple[List[SSTableMeta], CompactionReport]:
        """Performs k-way merge sort across source and target SSTables.

        Deduplicates keys by keeping the newest timestamp.
        Purges tombstones if is_bottom_level is True.
        """
        start_time = time.time()
        input_files = [r.file_id for r in source_readers + target_readers]
        bytes_before = sum(r.file_size for r in source_readers + target_readers)

        # 1. Collect all records from input SSTables
        all_records: List[Record] = []
        for reader in source_readers + target_readers:
            all_records.extend(reader.read_all_records())

        if not all_records:
            report = CompactionReport(
                source_level=source_level,
                target_level=target_level,
                input_files=input_files,
                output_files=[],
                records_merged=0,
                tombstones_purged=0,
                bytes_before=bytes_before,
                bytes_after=0,
                duration_ms=round((time.time() - start_time) * 1000, 2),
            )
            return [], report

        # 2. Sort by (key ASC, timestamp DESC)
        # That way, the newest version of any key appears first in sequence
        all_records.sort(key=lambda r: (r.key, -r.timestamp))

        # 3. Deduplicate keys & process tombstones
        merged_records: List[Record] = []
        last_key: Optional[bytes] = None
        tombstones_purged = 0

        for rec in all_records:
            if rec.key == last_key:
                # Shadowed older version: discard
                continue

            last_key = rec.key

            if rec.is_tombstone and is_bottom_level:
                # In the bottom-most level, no older version can exist below: safe to purge
                tombstones_purged += 1
                continue

            merged_records.append(rec)

        # 4. Partition merged records into new SSTable files
        new_metas: List[SSTableMeta] = []
        output_files: List[str] = []
        bytes_after = 0

        if merged_records:
            current_batch: List[Record] = []
            current_batch_bytes = 0

            def _flush_batch(batch: List[Record]) -> SSTableMeta:
                file_uuid = uuid.uuid4().hex[:8]
                filename = f"sstable_L{target_level}_{file_uuid}.sst"
                filepath = self.data_dir / filename
                writer = SSTableWriter(filepath)
                meta = writer.write_records(batch, level=target_level)
                return meta

            for rec in merged_records:
                current_batch.append(rec)
                current_batch_bytes += rec.encoded_size()

                if current_batch_bytes >= self.target_file_size:
                    meta = _flush_batch(current_batch)
                    new_metas.append(meta)
                    output_files.append(meta.file_id)
                    bytes_after += meta.file_size
                    current_batch = []
                    current_batch_bytes = 0

            if current_batch:
                meta = _flush_batch(current_batch)
                new_metas.append(meta)
                output_files.append(meta.file_id)
                bytes_after += meta.file_size

        duration_ms = round((time.time() - start_time) * 1000, 2)
        report = CompactionReport(
            source_level=source_level,
            target_level=target_level,
            input_files=input_files,
            output_files=output_files,
            records_merged=len(all_records),
            tombstones_purged=tombstones_purged,
            bytes_before=bytes_before,
            bytes_after=bytes_after,
            duration_ms=duration_ms,
        )

        return new_metas, report
