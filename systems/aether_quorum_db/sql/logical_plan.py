"""Logical plan operator nodes for SQL relational query planning."""

from __future__ import annotations

from dataclasses import dataclass, field

from .ast import Expression, OrderItem


@dataclass
class LogicalOperator:
    """Base class for all logical query plan operators."""

    def children(self) -> list[LogicalOperator]:
        return []

    def format_tree(self, indent: int = 0) -> str:
        prefix = "  " * indent
        s = f"{prefix}{self.describe()}"
        for child in self.children():
            s += "\n" + child.format_tree(indent + 1)
        return s

    def describe(self) -> str:
        return self.__class__.__name__


@dataclass
class LogicalScan(LogicalOperator):
    table_name: str
    alias: str | None = None
    columns: list[str] = field(default_factory=list)

    def describe(self) -> str:
        alias_str = f" AS {self.alias}" if self.alias and self.alias != self.table_name else ""
        cols_str = f" (cols: {', '.join(self.columns)})" if self.columns else ""
        return f"LogicalScan(table={self.table_name}{alias_str}){cols_str}"


@dataclass
class LogicalFilter(LogicalOperator):
    child: LogicalOperator
    predicate: Expression

    def children(self) -> list[LogicalOperator]:
        return [self.child]

    def describe(self) -> str:
        return f"LogicalFilter(predicate={self.predicate})"


@dataclass
class LogicalProject(LogicalOperator):
    child: LogicalOperator
    projections: list[tuple[Expression, str | None]]

    def children(self) -> list[LogicalOperator]:
        return [self.child]

    def describe(self) -> str:
        proj_str = ", ".join(f"{expr} AS {alias}" if alias else str(expr) for expr, alias in self.projections)
        return f"LogicalProject({proj_str})"


@dataclass
class LogicalJoin(LogicalOperator):
    left: LogicalOperator
    right: LogicalOperator
    join_type: str  # "INNER"
    on_condition: Expression | None = None

    def children(self) -> list[LogicalOperator]:
        return [self.left, self.right]

    def describe(self) -> str:
        on_str = f", on={self.on_condition}" if self.on_condition else ""
        return f"LogicalJoin(type={self.join_type}{on_str})"


@dataclass
class LogicalAggregate(LogicalOperator):
    child: LogicalOperator
    group_by: list[Expression]
    aggregates: list[tuple[Expression, str | None]]

    def children(self) -> list[LogicalOperator]:
        return [self.child]

    def describe(self) -> str:
        grp_str = ", ".join(str(g) for g in self.group_by)
        agg_str = ", ".join(f"{expr} AS {alias}" if alias else str(expr) for expr, alias in self.aggregates)
        return f"LogicalAggregate(group_by=[{grp_str}], aggs=[{agg_str}])"


@dataclass
class LogicalSort(LogicalOperator):
    child: LogicalOperator
    order_items: list[OrderItem]

    def children(self) -> list[LogicalOperator]:
        return [self.child]

    def describe(self) -> str:
        items_str = ", ".join(f"{item.expr} {'ASC' if item.ascending else 'DESC'}" for item in self.order_items)
        return f"LogicalSort({items_str})"


@dataclass
class LogicalLimit(LogicalOperator):
    child: LogicalOperator
    limit: int | None = None
    offset: int | None = None

    def children(self) -> list[LogicalOperator]:
        return [self.child]

    def describe(self) -> str:
        return f"LogicalLimit(limit={self.limit}, offset={self.offset})"
