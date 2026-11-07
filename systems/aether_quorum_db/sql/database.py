"""In-memory relational database engine powered by B+Tree storage."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from .ast import (
    Between,
    BinaryOp,
    ColumnRef,
    CreateIndex,
    CreateTable,
    Delete,
    DropTable,
    Explain,
    Expression,
    FunctionCall,
    InList,
    Insert,
    IsNull,
    Literal,
    Select,
    Star,
    Statement,
    UnaryOp,
    Update,
)
from .btree import BPlusTree
from .catalog import Catalog, ColumnSchema, IndexSchema, TableSchema
from .errors import SqlError
from .parser import Parser


class ExecutionError(SqlError):
    """Raised during SQL query execution."""


class ConstraintViolation(ExecutionError):
    """Raised when a unique, primary key, or not-null constraint is violated."""


@dataclass
class ResultSet:
    """Tabular result of a SQL query execution."""

    columns: list[str]
    rows: list[tuple[Any, ...]]

    @property
    def row_count(self) -> int:
        return len(self.rows)

    def to_dicts(self) -> list[dict[str, Any]]:
        return [dict(zip(self.columns, row)) for row in self.rows]


class TableStorage:
    """Manages B+Tree primary key storage and secondary indexes for a single table."""

    def __init__(self, schema: TableSchema) -> None:
        self.schema = schema
        # Maps primary key -> full row tuple (col0, col1, ...)
        self.pk_index: BPlusTree[Any, tuple[Any, ...]] = BPlusTree(degree=16)
        # Maps index_name -> BPlusTree[col_val, set[pk] or pk]
        self.secondary_indexes: dict[str, BPlusTree[Any, Any]] = {}
        self._auto_row_id = 1

        for idx_schema in schema.indexes.values():
            self.create_index_storage(idx_schema)

    def next_row_id(self) -> int:
        rid = self._auto_row_id
        self._auto_row_id += 1
        return rid

    def create_index_storage(self, idx_schema: IndexSchema) -> None:
        idx_tree: BPlusTree[Any, Any] = BPlusTree(degree=16)
        col_idx = self.schema.get_column_index(idx_schema.column_name)

        # Backfill index from existing rows
        for pk, row in self.pk_index.items():
            val = row[col_idx]
            if val is not None:
                if idx_schema.unique:
                    if val in idx_tree:
                        raise ConstraintViolation(
                            f"Unique constraint violated on column '{idx_schema.column_name}'"
                        )
                    idx_tree[val] = pk
                else:
                    bucket = idx_tree.get(val, set())
                    bucket.add(pk)
                    idx_tree[val] = bucket

        self.secondary_indexes[idx_schema.index_name.lower()] = idx_tree

    def insert_row(self, pk: Any, row: tuple[Any, ...]) -> None:
        # Check secondary index uniqueness first
        for idx_schema in self.schema.indexes.values():
            if idx_schema.unique:
                c_idx = self.schema.get_column_index(idx_schema.column_name)
                val = row[c_idx]
                if val is not None:
                    idx_tree = self.secondary_indexes[idx_schema.index_name.lower()]
                    existing_pk = idx_tree.get(val)
                    if existing_pk is not None and existing_pk != pk:
                        raise ConstraintViolation(
                            f"Unique constraint violated on column '{idx_schema.column_name}' with value {val!r}"
                        )

        # Insert into primary storage
        self.pk_index.insert(pk, row)

        # Update secondary indexes
        for idx_schema in self.schema.indexes.values():
            c_idx = self.schema.get_column_index(idx_schema.column_name)
            val = row[c_idx]
            if val is not None:
                idx_tree = self.secondary_indexes[idx_schema.index_name.lower()]
                if idx_schema.unique:
                    idx_tree[val] = pk
                else:
                    bucket = idx_tree.get(val, set())
                    bucket.add(pk)
                    idx_tree[val] = bucket

    def delete_row(self, pk: Any) -> tuple[Any, ...] | None:
        row = self.pk_index.get(pk)
        if row is None:
            return None

        # Remove from secondary indexes
        for idx_schema in self.schema.indexes.values():
            c_idx = self.schema.get_column_index(idx_schema.column_name)
            val = row[c_idx]
            if val is not None:
                idx_tree = self.secondary_indexes.get(idx_schema.index_name.lower())
                if idx_tree is not None:
                    if idx_schema.unique:
                        idx_tree.delete(val)
                    else:
                        bucket = idx_tree.get(val)
                        if bucket is not None:
                            bucket.discard(pk)
                            if not bucket:
                                idx_tree.delete(val)

        self.pk_index.delete(pk)
        return row


class Database:
    """In-memory relational database supporting DDL, DML, queries and snapshots."""

    def __init__(self) -> None:
        self.catalog = Catalog()
        self.tables: dict[str, TableStorage] = {}

    def execute(self, sql_or_ast: str | Statement) -> ResultSet:
        """Parse and execute a SQL statement."""
        stmt = Parser.parse_sql(sql_or_ast) if isinstance(sql_or_ast, str) else sql_or_ast
        handler = {
            CreateTable: self._exec_create_table,
            CreateIndex: self._exec_create_index,
            DropTable: self._exec_drop_table,
            Insert: self._exec_insert,
            Update: self._exec_update,
            Delete: self._exec_delete,
            Select: self._exec_select,
            Explain: self._exec_explain,
        }[type(stmt)]
        return handler(stmt)

    # ---- DDL Execution ---------------------------------------------------

    def _exec_create_table(self, stmt: CreateTable) -> ResultSet:
        columns: list[ColumnSchema] = []
        for col in stmt.columns:
            def_val = col.default.value if isinstance(col.default, Literal) else None
            columns.append(
                ColumnSchema(
                    name=col.name,
                    data_type=col.data_type,
                    primary_key=col.primary_key,
                    not_null=col.not_null,
                    default=def_val,
                )
            )

        schema = TableSchema(table_name=stmt.table.name, columns=columns)
        created = self.catalog.create_table(schema, if_not_exists=stmt.if_not_exists)
        if created:
            self.tables[stmt.table.name.lower()] = TableStorage(schema)
            status = f"Table '{stmt.table.name}' created"
        else:
            status = f"Table '{stmt.table.name}' already exists (skipped)"

        return ResultSet(columns=["status"], rows=[(status,)])

    def _exec_create_index(self, stmt: CreateIndex) -> ResultSet:
        schema = IndexSchema(
            index_name=stmt.index_name,
            table_name=stmt.table.name,
            column_name=stmt.column_name,
            unique=stmt.unique,
        )
        created = self.catalog.create_index(schema, if_not_exists=stmt.if_not_exists)
        if created:
            storage = self.tables[stmt.table.name.lower()]
            storage.create_index_storage(schema)
            status = f"Index '{stmt.index_name}' created on '{stmt.table.name}.{stmt.column_name}'"
        else:
            status = f"Index '{stmt.index_name}' already exists (skipped)"

        return ResultSet(columns=["status"], rows=[(status,)])

    def _exec_drop_table(self, stmt: DropTable) -> ResultSet:
        dropped = self.catalog.drop_table(stmt.table.name, if_exists=stmt.if_exists)
        if dropped:
            del self.tables[stmt.table.name.lower()]
            status = f"Table '{stmt.table.name}' dropped"
        else:
            status = f"Table '{stmt.table.name}' does not exist (skipped)"

        return ResultSet(columns=["status"], rows=[(status,)])

    # ---- DML Execution ---------------------------------------------------

    def _exec_insert(self, stmt: Insert) -> ResultSet:
        tbl_storage = self._get_storage(stmt.table.name)
        schema = tbl_storage.schema

        # If columns omitted, assume all columns in schema order
        target_cols = stmt.columns if stmt.columns else [c.name for c in schema.columns]
        target_indices = [schema.get_column_index(c) for c in target_cols]

        rows_inserted = 0
        for val_row in stmt.values:
            if len(val_row) != len(target_cols):
                raise ExecutionError(
                    f"INSERT value count ({len(val_row)}) does not match column count ({len(target_cols)})"
                )

            # Build full row tuple starting with column defaults
            full_row: list[Any] = [c.default for c in schema.columns]

            for col_idx, expr in zip(target_indices, val_row):
                full_row[col_idx] = self._eval_expr(expr, None, None)

            # Validate NOT NULL constraints
            for col_schema, val in zip(schema.columns, full_row):
                if col_schema.not_null and val is None:
                    raise ConstraintViolation(
                        f"NOT NULL constraint violated for column '{col_schema.name}'"
                    )

            # Determine Primary Key
            if schema.primary_key:
                pk_idx = schema.get_column_index(schema.primary_key)
                pk_val = full_row[pk_idx]
                if pk_val is None:
                    raise ConstraintViolation(f"Primary key '{schema.primary_key}' cannot be NULL")
                if pk_val in tbl_storage.pk_index:
                    raise ConstraintViolation(
                        f"Duplicate primary key value {pk_val!r} for column '{schema.primary_key}'"
                    )
            else:
                pk_val = tbl_storage.next_row_id()

            tbl_storage.insert_row(pk_val, tuple(full_row))
            rows_inserted += 1

        return ResultSet(columns=["rows_affected"], rows=[(rows_inserted,)])

    def _exec_update(self, stmt: Update) -> ResultSet:
        tbl_storage = self._get_storage(stmt.table.name)
        schema = tbl_storage.schema

        # Find rows matching WHERE
        matching_pks: list[Any] = []
        for pk, row in tbl_storage.pk_index.items():
            if stmt.where is None or self._eval_expr(stmt.where, row, schema):
                matching_pks.append(pk)

        rows_updated = 0
        for pk in matching_pks:
            old_row = tbl_storage.pk_index.get(pk)
            if old_row is None:
                continue

            new_row_list = list(old_row)
            for col_name, expr in stmt.assignments.items():
                c_idx = schema.get_column_index(col_name)
                new_row_list[c_idx] = self._eval_expr(expr, old_row, schema)

            # Check NOT NULL
            for col_schema, val in zip(schema.columns, new_row_list):
                if col_schema.not_null and val is None:
                    raise ConstraintViolation(
                        f"NOT NULL constraint violated for column '{col_schema.name}'"
                    )

            # Re-insert row
            tbl_storage.delete_row(pk)
            tbl_storage.insert_row(pk, tuple(new_row_list))
            rows_updated += 1

        return ResultSet(columns=["rows_affected"], rows=[(rows_updated,)])

    def _exec_delete(self, stmt: Delete) -> ResultSet:
        tbl_storage = self._get_storage(stmt.table.name)
        schema = tbl_storage.schema

        matching_pks: list[Any] = []
        for pk, row in tbl_storage.pk_index.items():
            if stmt.where is None or self._eval_expr(stmt.where, row, schema):
                matching_pks.append(pk)

        for pk in matching_pks:
            tbl_storage.delete_row(pk)

        return ResultSet(columns=["rows_affected"], rows=[(len(matching_pks),)])

    # ---- Query Execution (SELECT) ----------------------------------------

    def _exec_select(self, stmt: Select) -> ResultSet:
        if stmt.from_table is None:
            # Standalone SELECT without FROM: e.g. SELECT 1 + 2
            row_vals: list[Any] = []
            col_names: list[str] = []
            for i, proj in enumerate(stmt.projections):
                val = self._eval_expr(proj.expr, None, None)
                row_vals.append(val)
                col_names.append(proj.alias or f"col_{i}")
            return ResultSet(columns=col_names, rows=[tuple(row_vals)])

        # Fetch base table rows
        tbl_storage = self._get_storage(stmt.from_table.name)
        base_schema = tbl_storage.schema
        base_alias = stmt.from_table.alias or stmt.from_table.name

        intermediate_rows: list[dict[str, Any]] = []
        for row in tbl_storage.pk_index.values():
            row_dict: dict[str, Any] = {}
            for col_schema, val in zip(base_schema.columns, row):
                row_dict[f"{base_alias}.{col_schema.name}"] = val
                row_dict[col_schema.name] = val
            intermediate_rows.append(row_dict)

        # Handle INNER JOINs
        for join in stmt.joins:
            join_storage = self._get_storage(join.table.name)
            join_schema = join_storage.schema
            join_alias = join.table.alias or join.table.name

            joined_rows: list[dict[str, Any]] = []
            for left_dict in intermediate_rows:
                for right_row in join_storage.pk_index.values():
                    merged = dict(left_dict)
                    for col_schema, val in zip(join_schema.columns, right_row):
                        merged[f"{join_alias}.{col_schema.name}"] = val
                        # Do not overwrite unqualified key if already set by left table
                        if col_schema.name not in merged:
                            merged[col_schema.name] = val

                    # Test ON condition
                    if join.on_condition is None or self._eval_dict(join.on_condition, merged):
                        joined_rows.append(merged)
            intermediate_rows = joined_rows

        # Apply WHERE filter
        if stmt.where is not None:
            intermediate_rows = [
                r for r in intermediate_rows if self._eval_dict(stmt.where, r)
            ]

        # Check if query uses aggregations (COUNT, SUM, AVG, MIN, MAX)
        has_agg = any(self._is_aggregate(p.expr) for p in stmt.projections) or bool(stmt.group_by)

        if has_agg:
            result_rows, col_names = self._eval_aggregation(stmt, intermediate_rows)
        else:
            # Simple projection
            col_names = []
            for i, p in enumerate(stmt.projections):
                if isinstance(p.expr, Star):
                    # Expand star
                    for k in sorted(intermediate_rows[0].keys()) if intermediate_rows else []:
                        if "." not in k:
                            col_names.append(k)
                else:
                    col_names.append(p.alias or str(p.expr))

            result_rows = []
            for r in intermediate_rows:
                row_vals = []
                for p in stmt.projections:
                    if isinstance(p.expr, Star):
                        for k in sorted(r.keys()):
                            if "." not in k:
                                row_vals.append(r[k])
                    else:
                        row_vals.append(self._eval_dict(p.expr, r))
                result_rows.append(tuple(row_vals))

        # ORDER BY
        if stmt.order_by:
            for item in reversed(stmt.order_by):
                result_rows.sort(
                    key=lambda r, item=item: (self._eval_order_key(item.expr, r, col_names) is None, self._eval_order_key(item.expr, r, col_names)),
                    reverse=not item.ascending,
                )

        # OFFSET
        if stmt.offset:
            result_rows = result_rows[stmt.offset :]

        # LIMIT
        if stmt.limit is not None:
            result_rows = result_rows[: stmt.limit]

        return ResultSet(columns=col_names, rows=result_rows)

    def _eval_aggregation(
        self,
        stmt: Select,
        rows: list[dict[str, Any]],
    ) -> tuple[list[tuple[Any, ...]], list[str]]:
        # Group rows by group_by keys
        groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
        for r in rows:
            group_key = tuple(self._eval_dict(expr, r) for expr in stmt.group_by)
            groups.setdefault(group_key, []).append(r)

        if not groups and not stmt.group_by:
            # e.g. SELECT COUNT(*) FROM empty_table -> produces single row with 0
            groups[()] = []

        result_rows: list[tuple[Any, ...]] = []
        col_names = [p.alias or str(p.expr) for p in stmt.projections]

        for group_key, group_rows in groups.items():
            row_vals: list[Any] = []
            for p in stmt.projections:
                val = self._eval_agg_expr(p.expr, group_rows)
                row_vals.append(val)

            # HAVING filter
            if stmt.having is not None:
                having_ok = self._eval_agg_expr(stmt.having, group_rows)
                if not having_ok:
                    continue

            result_rows.append(tuple(row_vals))

        return result_rows, col_names

    def _is_aggregate(self, expr: Expression) -> bool:
        if isinstance(expr, FunctionCall):
            return expr.name.upper() in ("COUNT", "SUM", "AVG", "MIN", "MAX")
        if isinstance(expr, (BinaryOp, UnaryOp)):
            return self._is_aggregate(getattr(expr, "operand", getattr(expr, "left", None))) or (
                isinstance(expr, BinaryOp) and self._is_aggregate(expr.right)
            )
        return False

    def _eval_agg_expr(self, expr: Expression, group_rows: list[dict[str, Any]]) -> Any:
        if isinstance(expr, FunctionCall):
            name = expr.name.upper()
            if name == "COUNT":
                if expr.is_star:
                    return len(group_rows)
                cnt = 0
                for r in group_rows:
                    if self._eval_dict(expr.args[0], r) is not None:
                        cnt += 1
                return cnt
            elif name == "SUM":
                vals = [self._eval_dict(expr.args[0], r) for r in group_rows]
                non_nulls = [v for v in vals if v is not None]
                return sum(non_nulls) if non_nulls else None
            elif name == "AVG":
                vals = [self._eval_dict(expr.args[0], r) for r in group_rows]
                non_nulls = [v for v in vals if v is not None]
                return sum(non_nulls) / len(non_nulls) if non_nulls else None
            elif name == "MIN":
                vals = [self._eval_dict(expr.args[0], r) for r in group_rows]
                non_nulls = [v for v in vals if v is not None]
                return min(non_nulls) if non_nulls else None
            elif name == "MAX":
                vals = [self._eval_dict(expr.args[0], r) for r in group_rows]
                non_nulls = [v for v in vals if v is not None]
                return max(non_nulls) if non_nulls else None

        if isinstance(expr, BinaryOp):
            l = self._eval_agg_expr(expr.left, group_rows)
            r = self._eval_agg_expr(expr.right, group_rows)
            return self._apply_binary_op(expr.op, l, r)

        # Non-aggregate expression inside group: evaluate on first row
        if group_rows:
            return self._eval_dict(expr, group_rows[0])
        return None

    def _eval_order_key(self, expr: Expression, row: tuple[Any, ...], col_names: list[str]) -> Any:
        # Check if ordering by projected column name
        if isinstance(expr, ColumnRef) and expr.name in col_names:
            idx = col_names.index(expr.name)
            return row[idx]
        return None

    def _exec_explain(self, stmt: Explain) -> ResultSet:
        plan = "Sequential Scan on Table"
        if isinstance(stmt.statement, Select) and stmt.statement.from_table:
            tbl_name = stmt.statement.from_table.name
            plan = f"SeqScan(Table: {tbl_name})"
            if stmt.statement.where:
                plan = f"Filter(Predicate: {stmt.statement.where}) -> {plan}"
            plan = f"Project(Projections: {[str(p.expr) for p in stmt.statement.projections]}) -> {plan}"
        return ResultSet(columns=["EXPLAIN"], rows=[(plan,)])

    # ---- Expression Evaluator --------------------------------------------

    def _eval_expr(
        self,
        expr: Expression,
        row: tuple[Any, ...] | None,
        schema: TableSchema | None,
    ) -> Any:
        if isinstance(expr, Literal):
            return expr.value

        if isinstance(expr, ColumnRef):
            if schema is None or row is None:
                raise ExecutionError(f"Cannot resolve column '{expr.name}' without row context")
            c_idx = schema.get_column_index(expr.name)
            return row[c_idx]

        if isinstance(expr, UnaryOp):
            val = self._eval_expr(expr.operand, row, schema)
            if expr.op == "NOT":
                return not val
            if expr.op == "-":
                return -val
            if expr.op == "+":
                return +val

        if isinstance(expr, BinaryOp):
            l = self._eval_expr(expr.left, row, schema)
            r = self._eval_expr(expr.right, row, schema)
            return self._apply_binary_op(expr.op, l, r)

        if isinstance(expr, IsNull):
            val = self._eval_expr(expr.operand, row, schema)
            return (val is not None) if expr.negated else (val is None)

        if isinstance(expr, Between):
            val = self._eval_expr(expr.expr, row, schema)
            low = self._eval_expr(expr.low, row, schema)
            high = self._eval_expr(expr.high, row, schema)
            ok = (low <= val <= high) if val is not None else False
            return not ok if expr.negated else ok

        if isinstance(expr, InList):
            val = self._eval_expr(expr.expr, row, schema)
            candidates = [self._eval_expr(e, row, schema) for e in expr.values]
            ok = val in candidates
            return not ok if expr.negated else ok

        raise ExecutionError(f"Unsupported expression: {expr!r}")

    def _eval_dict(self, expr: Expression, r: dict[str, Any]) -> Any:
        if isinstance(expr, Literal):
            return expr.value

        if isinstance(expr, ColumnRef):
            # Check qualified "table.col" first, then unqualified "col"
            lookup_key = f"{expr.table}.{expr.name}" if expr.table else expr.name
            if lookup_key in r:
                return r[lookup_key]
            if expr.name in r:
                return r[expr.name]
            raise ExecutionError(f"Column '{lookup_key}' not found in query row: {list(r.keys())}")

        if isinstance(expr, UnaryOp):
            val = self._eval_dict(expr.operand, r)
            if expr.op == "NOT":
                return not val
            if expr.op == "-":
                return -val
            if expr.op == "+":
                return +val

        if isinstance(expr, BinaryOp):
            l = self._eval_dict(expr.left, r)
            r_val = self._eval_dict(expr.right, r)
            return self._apply_binary_op(expr.op, l, r_val)

        if isinstance(expr, IsNull):
            val = self._eval_dict(expr.operand, r)
            return (val is not None) if expr.negated else (val is None)

        if isinstance(expr, Between):
            val = self._eval_dict(expr.expr, r)
            low = self._eval_dict(expr.low, r)
            high = self._eval_dict(expr.high, r)
            ok = (low <= val <= high) if val is not None else False
            return not ok if expr.negated else ok

        if isinstance(expr, InList):
            val = self._eval_dict(expr.expr, r)
            candidates = [self._eval_dict(e, r) for e in expr.values]
            ok = val in candidates
            return not ok if expr.negated else ok

        raise ExecutionError(f"Unsupported expression: {expr!r}")

    def _apply_binary_op(self, op: str, l: Any, r: Any) -> Any:
        if op == "=":
            return l == r
        if op in ("!=", "<>"):
            return l != r
        if op == "<":
            return l < r
        if op == "<=":
            return l <= r
        if op == ">":
            return l > r
        if op == ">=":
            return l >= r
        if op == "AND":
            return bool(l) and bool(r)
        if op == "OR":
            return bool(l) or bool(r)
        if op == "+":
            return l + r
        if op == "-":
            return l - r
        if op == "*":
            return l * r
        if op == "/":
            return l / r
        if op == "%":
            return l % r
        if op.upper() == "LIKE":
            pattern = re.escape(str(r)).replace("%", ".*").replace("_", ".")
            return bool(re.match(f"^{pattern}$", str(l), re.IGNORECASE))
        raise ExecutionError(f"Unknown binary operator: {op!r}")

    def _get_storage(self, table_name: str) -> TableStorage:
        tbl = self.tables.get(table_name.lower())
        if tbl is None:
            raise ExecutionError(f"Table '{table_name}' does not exist")
        return tbl

    # ---- State Machine & Snapshot Serialization --------------------------

    def create_snapshot(self) -> bytes:
        data: dict[str, Any] = {"tables": {}}
        for tbl_name, tbl_storage in self.tables.items():
            schema = tbl_storage.schema
            cols = [
                {
                    "name": c.name,
                    "data_type": c.data_type,
                    "primary_key": c.primary_key,
                    "not_null": c.not_null,
                    "default": c.default,
                }
                for c in schema.columns
            ]
            idxs = [
                {
                    "index_name": idx.index_name,
                    "table_name": idx.table_name,
                    "column_name": idx.column_name,
                    "unique": idx.unique,
                }
                for idx in schema.indexes.values()
            ]
            rows = [list(row) for _, row in tbl_storage.pk_index.items()]
            data["tables"][tbl_name] = {
                "columns": cols,
                "indexes": idxs,
                "rows": rows,
                "auto_row_id": tbl_storage._auto_row_id,
            }
        return json.dumps(data, sort_keys=True).encode("utf-8")

    def restore_snapshot(self, snapshot_bytes: bytes) -> None:
        if not snapshot_bytes:
            return
        data = json.loads(snapshot_bytes.decode("utf-8"))
        self.catalog = Catalog()
        self.tables = {}

        for tbl_name, tbl_data in data.get("tables", {}).items():
            columns = [
                ColumnSchema(
                    name=c["name"],
                    data_type=c["data_type"],
                    primary_key=c["primary_key"],
                    not_null=c["not_null"],
                    default=c["default"],
                )
                for c in tbl_data["columns"]
            ]
            schema = TableSchema(table_name=tbl_name, columns=columns)
            self.catalog.create_table(schema)
            storage = TableStorage(schema)
            storage._auto_row_id = tbl_data.get("auto_row_id", 1)

            # Secondary indexes
            for idx in tbl_data.get("indexes", []):
                idx_schema = IndexSchema(
                    index_name=idx["index_name"],
                    table_name=idx["table_name"],
                    column_name=idx["column_name"],
                    unique=idx["unique"],
                )
                self.catalog.create_index(idx_schema)
                storage.create_index_storage(idx_schema)

            # Insert rows
            for r in tbl_data.get("rows", []):
                row_tuple = tuple(r)
                if schema.primary_key:
                    pk_idx = schema.get_column_index(schema.primary_key)
                    pk = row_tuple[pk_idx]
                else:
                    pk = storage.next_row_id()
                storage.insert_row(pk, row_tuple)

            self.tables[tbl_name.lower()] = storage
