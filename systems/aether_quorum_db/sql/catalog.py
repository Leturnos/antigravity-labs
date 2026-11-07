"""SQL Schema, Column definitions, and Catalog registry."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .errors import SqlError


class CatalogError(SqlError):
    """Raised on schema or catalog validation errors."""


@dataclass(frozen=True)
class ColumnSchema:
    name: str
    data_type: str
    primary_key: bool = False
    not_null: bool = False
    default: Any = None


@dataclass(frozen=True)
class IndexSchema:
    index_name: str
    table_name: str
    column_name: str
    unique: bool = False


@dataclass
class TableSchema:
    table_name: str
    columns: list[ColumnSchema]
    indexes: dict[str, IndexSchema] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.column_indices: dict[str, int] = {
            col.name.lower(): idx for idx, col in enumerate(self.columns)
        }
        pks = [c.name for c in self.columns if c.primary_key]
        if len(pks) > 1:
            raise CatalogError(f"Table '{self.table_name}' has multiple primary keys: {pks}")
        self.primary_key: str | None = pks[0] if pks else None

    def get_column_index(self, col_name: str) -> int:
        idx = self.column_indices.get(col_name.lower())
        if idx is None:
            raise CatalogError(f"Column '{col_name}' does not exist in table '{self.table_name}'")
        return idx

    def get_column(self, col_name: str) -> ColumnSchema:
        idx = self.get_column_index(col_name)
        return self.columns[idx]


class Catalog:
    """Manages metadata for tables and indexes."""

    def __init__(self) -> None:
        self.tables: dict[str, TableSchema] = {}

    def create_table(self, schema: TableSchema, if_not_exists: bool = False) -> bool:
        tbl_key = schema.table_name.lower()
        if tbl_key in self.tables:
            if if_not_exists:
                return False
            raise CatalogError(f"Table '{schema.table_name}' already exists")
        self.tables[tbl_key] = schema
        return True

    def drop_table(self, table_name: str, if_exists: bool = False) -> bool:
        tbl_key = table_name.lower()
        if tbl_key not in self.tables:
            if if_exists:
                return False
            raise CatalogError(f"Table '{table_name}' does not exist")
        del self.tables[tbl_key]
        return True

    def get_table(self, table_name: str) -> TableSchema | None:
        return self.tables.get(table_name.lower())

    def create_index(self, index_schema: IndexSchema, if_not_exists: bool = False) -> bool:
        table = self.get_table(index_schema.table_name)
        if table is None:
            raise CatalogError(f"Table '{index_schema.table_name}' does not exist for index")

        # Validate that column exists
        table.get_column_index(index_schema.column_name)

        idx_key = index_schema.index_name.lower()
        if idx_key in table.indexes:
            if if_not_exists:
                return False
            raise CatalogError(f"Index '{index_schema.index_name}' already exists on table '{index_schema.table_name}'")

        table.indexes[idx_key] = index_schema
        return True
