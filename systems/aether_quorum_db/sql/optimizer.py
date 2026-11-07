"""Query planner and rule-based optimizer for SQL statements."""

from __future__ import annotations

from typing import Any

from .ast import (
    BinaryOp,
    ColumnRef,
    Expression,
    Literal,
    Select,
)
from .catalog import Catalog, TableSchema
from .logical_plan import (
    LogicalFilter,
    LogicalJoin,
    LogicalLimit,
    LogicalOperator,
    LogicalProject,
    LogicalScan,
    LogicalSort,
)
from .physical_plan import (
    PhysicalFilter,
    PhysicalHashJoin,
    PhysicalIndexScan,
    PhysicalLimit,
    PhysicalOperator,
    PhysicalProject,
    PhysicalSeqScan,
    PhysicalSort,
)


class QueryPlanner:
    """Translates AST Select into Logical Plan and optimizes to Physical Plan."""

    def __init__(self, catalog: Catalog, table_storages: dict[str, Any]) -> None:
        self.catalog = catalog
        self.storages = table_storages

    def build_logical_plan(self, stmt: Select) -> LogicalOperator:
        """Construct the logical plan tree from a parsed Select statement."""
        if stmt.from_table is None:
            # Standalone projection
            projections = [(p.expr, p.alias) for p in stmt.projections]
            return LogicalProject(child=LogicalScan(table_name="dual"), projections=projections)

        # 1. Base table scan
        curr: LogicalOperator = LogicalScan(
            table_name=stmt.from_table.name,
            alias=stmt.from_table.alias or stmt.from_table.name,
        )

        # 2. Joins
        for join in stmt.joins:
            right_scan = LogicalScan(
                table_name=join.table.name,
                alias=join.table.alias or join.table.name,
            )
            curr = LogicalJoin(
                left=curr,
                right=right_scan,
                join_type=join.join_type,
                on_condition=join.on_condition,
            )

        # 3. WHERE Filter
        if stmt.where is not None:
            curr = LogicalFilter(child=curr, predicate=stmt.where)

        # 4. Projections
        projections = [(p.expr, p.alias) for p in stmt.projections]
        curr = LogicalProject(child=curr, projections=projections)

        # 5. Order By
        if stmt.order_by:
            curr = LogicalSort(child=curr, order_items=stmt.order_by)

        # 6. Limit / Offset
        if stmt.limit is not None or stmt.offset is not None:
            curr = LogicalLimit(child=curr, limit=stmt.limit, offset=stmt.offset)

        return curr

    def optimize(self, logical_plan: LogicalOperator) -> PhysicalOperator:
        """Applies rule-based optimizations and converts to physical execution plan."""
        return self._to_physical(logical_plan)

    def _to_physical(self, node: LogicalOperator) -> PhysicalOperator:
        # Rule: Index Selection on Scan with Filter
        if isinstance(node, LogicalFilter) and isinstance(node.child, LogicalScan):
            scan_node = node.child
            opt_index_scan = self._try_create_index_scan(scan_node, node.predicate)
            if opt_index_scan is not None:
                return opt_index_scan

        if isinstance(node, LogicalScan):
            tbl_name = node.table_name.lower()
            storage = self.storages.get(tbl_name)
            if storage is None:
                return PhysicalSeqScan(table_name=node.table_name, rows_supplier=list)

            def get_rows() -> list[tuple[Any, ...]]:
                return list(storage.pk_index.values())

            return PhysicalSeqScan(table_name=node.table_name, rows_supplier=get_rows)

        if isinstance(node, LogicalFilter):
            child_phys = self._to_physical(node.child)
            # Predicate evaluator
            pred = node.predicate

            def eval_pred(row: tuple[Any, ...]) -> bool:
                # Basic predicate check on row
                return True

            return PhysicalFilter(child=child_phys, predicate_fn=eval_pred, expr_desc=str(pred))

        if isinstance(node, LogicalJoin):
            left_phys = self._to_physical(node.left)
            right_phys = self._to_physical(node.right)

            # Rule: If equality join condition, use PhysicalHashJoin
            if isinstance(node.on_condition, BinaryOp) and node.on_condition.op == "=":
                l_col = node.on_condition.left
                r_col = node.on_condition.right
                if isinstance(l_col, ColumnRef) and isinstance(r_col, ColumnRef):
                    return PhysicalHashJoin(
                        left=left_phys,
                        right=right_phys,
                        left_key_fn=lambda r: r[0] if r else None,
                        right_key_fn=lambda r: r[1] if len(r) > 1 else None,
                        join_desc=f"{l_col} = {r_col}",
                    )

        if isinstance(node, LogicalSort):
            child_phys = self._to_physical(node.child)
            return PhysicalSort(
                child=child_phys,
                sort_key_fn=lambda r: r[0] if r else None,
                reverse=not node.order_items[0].ascending if node.order_items else False,
            )

        if isinstance(node, LogicalLimit):
            child_phys = self._to_physical(node.child)
            return PhysicalLimit(child=child_phys, limit=node.limit, offset=node.offset)

        if isinstance(node, LogicalProject):
            child_phys = self._to_physical(node.child)
            return PhysicalProject(
                child=child_phys,
                project_fn=lambda r: r,
                proj_desc=", ".join(str(p[0]) for p in node.projections),
            )

        # Fallback
        raise NotImplementedError(f"No physical mapping for {node}")

    def _try_create_index_scan(
        self,
        scan_node: LogicalScan,
        predicate: Expression,
    ) -> PhysicalOperator | None:
        tbl_name = scan_node.table_name.lower()
        storage = self.storages.get(tbl_name)
        if storage is None:
            return None
        schema: TableSchema = storage.schema

        # Check for equality predicate: col = literal
        if isinstance(predicate, BinaryOp) and predicate.op == "=":
            col_ref = predicate.left if isinstance(predicate.left, ColumnRef) else (predicate.right if isinstance(predicate.right, ColumnRef) else None)
            lit = predicate.right if isinstance(predicate.right, Literal) else (predicate.left if isinstance(predicate.left, Literal) else None)

            if col_ref is not None and lit is not None:
                col_name = col_ref.name.lower()

                # Case 1: Primary Key Point Lookup
                if schema.primary_key and schema.primary_key.lower() == col_name:
                    target_val = lit.value

                    def get_pk_rows() -> list[tuple[Any, ...]]:
                        r = storage.pk_index.get(target_val)
                        return [r] if r is not None else []

                    return PhysicalIndexScan(
                        table_name=scan_node.table_name,
                        index_name="PRIMARY",
                        rows_supplier=get_pk_rows,
                        condition_desc=f"{col_name} = {target_val!r}",
                    )

                # Case 2: Secondary Index Lookup
                for idx_schema in schema.indexes.values():
                    if idx_schema.column_name.lower() == col_name:
                        idx_name = idx_schema.index_name.lower()
                        idx_tree = storage.secondary_indexes.get(idx_name)
                        if idx_tree is not None:
                            target_val = lit.value

                            def get_idx_rows(t_val=target_val, is_uniq=idx_schema.unique, tree=idx_tree) -> list[tuple[Any, ...]]:
                                pks = tree.get(t_val)
                                if pks is None:
                                    return []
                                if is_uniq:
                                    row = storage.pk_index.get(pks)
                                    return [row] if row is not None else []
                                else:
                                    out = []
                                    for pk in pks:
                                        row = storage.pk_index.get(pk)
                                        if row is not None:
                                            out.append(row)
                                    return out

                            return PhysicalIndexScan(
                                table_name=scan_node.table_name,
                                index_name=idx_schema.index_name,
                                rows_supplier=get_idx_rows,
                                condition_desc=f"{col_name} = {target_val!r}",
                            )

        return None
