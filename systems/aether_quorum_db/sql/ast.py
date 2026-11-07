"""Abstract Syntax Tree (AST) node definitions for SQL."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ============================================================================
# Base Nodes
# ============================================================================

@dataclass(frozen=True)
class ASTNode:
    """Base class for all AST nodes."""


@dataclass(frozen=True)
class Expression(ASTNode):
    """Base class for all scalar and boolean expressions."""


@dataclass(frozen=True)
class Statement(ASTNode):
    """Base class for top-level SQL statements."""


# ============================================================================
# Expressions
# ============================================================================

@dataclass(frozen=True)
class Literal(Expression):
    value: Any


@dataclass(frozen=True)
class ColumnRef(Expression):
    name: str
    table: str | None = None

    def __str__(self) -> str:
        return f"{self.table}.{self.name}" if self.table else self.name


@dataclass(frozen=True)
class Star(Expression):
    table: str | None = None

    def __str__(self) -> str:
        return f"{self.table}.*" if self.table else "*"


@dataclass(frozen=True)
class UnaryOp(Expression):
    op: str
    operand: Expression


@dataclass(frozen=True)
class BinaryOp(Expression):
    op: str
    left: Expression
    right: Expression


@dataclass(frozen=True)
class FunctionCall(Expression):
    name: str
    args: list[Expression] = field(default_factory=list)
    is_star: bool = False


@dataclass(frozen=True)
class IsNull(Expression):
    operand: Expression
    negated: bool = False  # True for IS NOT NULL


@dataclass(frozen=True)
class Between(Expression):
    expr: Expression
    low: Expression
    high: Expression
    negated: bool = False


@dataclass(frozen=True)
class InList(Expression):
    expr: Expression
    values: list[Expression]
    negated: bool = False


# ============================================================================
# Clause Helpers
# ============================================================================

@dataclass(frozen=True)
class TableRef(ASTNode):
    name: str
    alias: str | None = None


@dataclass(frozen=True)
class Projection(ASTNode):
    expr: Expression
    alias: str | None = None


@dataclass(frozen=True)
class ColumnDef(ASTNode):
    name: str
    data_type: str
    primary_key: bool = False
    not_null: bool = False
    default: Expression | None = None


@dataclass(frozen=True)
class OrderItem(ASTNode):
    expr: Expression
    ascending: bool = True


@dataclass(frozen=True)
class JoinClause(ASTNode):
    join_type: str  # "INNER"
    table: TableRef
    on_condition: Expression | None = None


# ============================================================================
# Statements
# ============================================================================

@dataclass(frozen=True)
class CreateTable(Statement):
    table: TableRef
    columns: list[ColumnDef]
    if_not_exists: bool = False


@dataclass(frozen=True)
class CreateIndex(Statement):
    index_name: str
    table: TableRef
    column_name: str
    unique: bool = False
    if_not_exists: bool = False


@dataclass(frozen=True)
class DropTable(Statement):
    table: TableRef
    if_exists: bool = False


@dataclass(frozen=True)
class Insert(Statement):
    table: TableRef
    columns: list[str]
    values: list[list[Expression]]


@dataclass(frozen=True)
class Update(Statement):
    table: TableRef
    assignments: dict[str, Expression]
    where: Expression | None = None


@dataclass(frozen=True)
class Delete(Statement):
    table: TableRef
    where: Expression | None = None


@dataclass(frozen=True)
class Select(Statement):
    projections: list[Projection]
    from_table: TableRef | None = None
    joins: list[JoinClause] = field(default_factory=list)
    where: Expression | None = None
    group_by: list[Expression] = field(default_factory=list)
    having: Expression | None = None
    order_by: list[OrderItem] = field(default_factory=list)
    limit: int | None = None
    offset: int | None = None


@dataclass(frozen=True)
class Explain(Statement):
    statement: Statement
