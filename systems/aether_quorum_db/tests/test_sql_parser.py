"""Tests for SQL Lexer, AST and recursive-descent / Pratt parser."""

import pytest

from systems.aether_quorum_db.sql import (
    Between,
    BinaryOp,
    ColumnRef,
    CreateIndex,
    CreateTable,
    Delete,
    DropTable,
    Explain,
    FunctionCall,
    InList,
    Insert,
    IsNull,
    Lexer,
    LexError,
    Literal,
    ParseError,
    Parser,
    Select,
    Star,
    TableRef,
    TokenType,
    UnaryOp,
    Update,
)

# ============================================================================
# Lexer Tests
# ============================================================================

def test_lexer_tokenizes_literals_and_keywords():
    sql = "SELECT 42, 3.14, 'hello world', 'it''s ok', TRUE, FALSE, NULL FROM users"
    tokens = Lexer(sql).tokenize()

    types = [t.type for t in tokens]
    assert types == [
        TokenType.SELECT,
        TokenType.INTEGER,
        TokenType.COMMA,
        TokenType.FLOAT,
        TokenType.COMMA,
        TokenType.STRING,
        TokenType.COMMA,
        TokenType.STRING,
        TokenType.COMMA,
        TokenType.BOOLEAN,
        TokenType.COMMA,
        TokenType.BOOLEAN,
        TokenType.COMMA,
        TokenType.NULL,
        TokenType.FROM,
        TokenType.IDENTIFIER,
        TokenType.EOF,
    ]
    assert tokens[1].value == 42
    assert tokens[3].value == 3.14
    assert tokens[5].value == "hello world"
    assert tokens[7].value == "it's ok"
    assert tokens[9].value is True
    assert tokens[11].value is False
    assert tokens[13].value is None


def test_lexer_handles_quoted_identifiers_and_comments():
    sql = """
    -- Leading comment
    SELECT `user id`, "user name" /* inline comment */ FROM users;
    """
    tokens = Lexer(sql).tokenize()
    identifiers = [t.value for t in tokens if t.type == TokenType.IDENTIFIER]
    assert identifiers == ["user id", "user name", "users"]


def test_lexer_tracks_lines_and_columns_on_error():
    sql = "SELECT * FROM users\nWHERE 'unterminated string"
    with pytest.raises(LexError) as exc_info:
        Lexer(sql).tokenize()
    assert exc_info.value.line == 2
    assert exc_info.value.column == 7
    assert "unterminated string literal" in str(exc_info.value)


# ============================================================================
# DDL Parser Tests
# ============================================================================

def test_parse_create_table():
    sql = """
    CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY,
        name TEXT NOT NULL,
        score FLOAT DEFAULT 0.0,
        active BOOL DEFAULT true
    );
    """
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, CreateTable)
    assert stmt.table.name == "users"
    assert stmt.if_not_exists is True
    assert len(stmt.columns) == 4

    col_id = stmt.columns[0]
    assert col_id.name == "id"
    assert col_id.data_type == "INT"
    assert col_id.primary_key is True
    assert col_id.not_null is True

    col_name = stmt.columns[1]
    assert col_name.name == "name"
    assert col_name.not_null is True

    col_score = stmt.columns[2]
    assert col_score.name == "score"
    assert isinstance(col_score.default, Literal)
    assert col_score.default.value == 0.0


def test_parse_create_index():
    sql = "CREATE UNIQUE INDEX IF NOT EXISTS idx_email ON users (email);"
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, CreateIndex)
    assert stmt.index_name == "idx_email"
    assert stmt.table.name == "users"
    assert stmt.column_name == "email"
    assert stmt.unique is True
    assert stmt.if_not_exists is True


def test_parse_drop_table():
    sql = "DROP TABLE IF EXISTS old_table;"
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, DropTable)
    assert stmt.table.name == "old_table"
    assert stmt.if_exists is True


# ============================================================================
# DML Parser Tests
# ============================================================================

def test_parse_insert():
    sql = "INSERT INTO users (id, name, active) VALUES (1, 'Alice', true), (2, 'Bob', false);"
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, Insert)
    assert stmt.table.name == "users"
    assert stmt.columns == ["id", "name", "active"]
    assert len(stmt.values) == 2
    assert stmt.values[0][0] == Literal(1)
    assert stmt.values[0][1] == Literal("Alice")
    assert stmt.values[1][0] == Literal(2)
    assert stmt.values[1][1] == Literal("Bob")


def test_parse_update():
    sql = "UPDATE users SET name = 'Alicia', active = false WHERE id = 1;"
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, Update)
    assert stmt.table.name == "users"
    assert stmt.assignments["name"] == Literal("Alicia")
    assert stmt.assignments["active"] == Literal(False)
    assert isinstance(stmt.where, BinaryOp)
    assert stmt.where.op == "="
    assert stmt.where.left == ColumnRef("id")
    assert stmt.where.right == Literal(1)


def test_parse_delete():
    sql = "DELETE FROM users WHERE active = false;"
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, Delete)
    assert stmt.table.name == "users"
    assert isinstance(stmt.where, BinaryOp)
    assert stmt.where.op == "="


# ============================================================================
# Query (SELECT) Parser Tests
# ============================================================================

def test_parse_select_projections_and_joins():
    sql = """
    SELECT u.id, u.name AS user_name, o.total
    FROM users AS u
    INNER JOIN orders o ON u.id = o.user_id
    WHERE o.total > 100 AND u.active = true;
    """
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, Select)
    assert len(stmt.projections) == 3
    assert stmt.projections[0].expr == ColumnRef("id", table="u")
    assert stmt.projections[1].expr == ColumnRef("name", table="u")
    assert stmt.projections[1].alias == "user_name"
    assert stmt.projections[2].expr == ColumnRef("total", table="o")

    assert stmt.from_table == TableRef("users", alias="u")
    assert len(stmt.joins) == 1
    join = stmt.joins[0]
    assert join.table == TableRef("orders", alias="o")
    assert isinstance(join.on_condition, BinaryOp)
    assert join.on_condition.op == "="


def test_parse_select_group_by_having_order_limit():
    sql = """
    SELECT dept, COUNT(*), AVG(salary)
    FROM employees
    GROUP BY dept
    HAVING COUNT(*) > 5
    ORDER BY AVG(salary) DESC, dept ASC
    LIMIT 10 OFFSET 20;
    """
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, Select)
    assert len(stmt.projections) == 3
    assert stmt.projections[1].expr == FunctionCall(name="COUNT", args=[], is_star=True)
    assert stmt.projections[2].expr == FunctionCall(name="AVG", args=[ColumnRef("salary")])

    assert len(stmt.group_by) == 1
    assert stmt.group_by[0] == ColumnRef("dept")

    assert isinstance(stmt.having, BinaryOp)
    assert stmt.having.op == ">"

    assert len(stmt.order_by) == 2
    assert stmt.order_by[0].ascending is False
    assert stmt.order_by[1].ascending is True

    assert stmt.limit == 10
    assert stmt.offset == 20


def test_parse_explain_statement():
    sql = "EXPLAIN SELECT * FROM users WHERE id = 42;"
    stmt = Parser.parse_sql(sql)
    assert isinstance(stmt, Explain)
    assert isinstance(stmt.statement, Select)
    assert stmt.statement.projections[0].expr == Star()


# ============================================================================
# Pratt Expression Precedence Tests
# ============================================================================

def test_pratt_arithmetic_precedence():
    # 1 + 2 * 3 should parse as 1 + (2 * 3)
    stmt = Parser.parse_sql("SELECT 1 + 2 * 3 FROM t;")
    expr = stmt.projections[0].expr
    assert isinstance(expr, BinaryOp)
    assert expr.op == "+"
    assert expr.left == Literal(1)
    assert isinstance(expr.right, BinaryOp)
    assert expr.right.op == "*"
    assert expr.right.left == Literal(2)
    assert expr.right.right == Literal(3)


def test_pratt_logical_and_comparison_precedence():
    # a OR b AND c should parse as a OR (b AND c)
    stmt = Parser.parse_sql("SELECT * FROM t WHERE a > 1 OR b < 2 AND c = 3;")
    where = stmt.where
    assert isinstance(where, BinaryOp)
    assert where.op == "OR"
    assert isinstance(where.left, BinaryOp)
    assert where.left.op == ">"
    assert isinstance(where.right, BinaryOp)
    assert where.right.op == "AND"


def test_pratt_unary_and_parentheses():
    stmt = Parser.parse_sql("SELECT -(1 + 2), NOT active FROM t;")
    p0 = stmt.projections[0].expr
    assert isinstance(p0, UnaryOp)
    assert p0.op == "-"
    assert isinstance(p0.operand, BinaryOp)
    assert p0.operand.op == "+"

    p1 = stmt.projections[1].expr
    assert isinstance(p1, UnaryOp)
    assert p1.op == "NOT"
    assert p1.operand == ColumnRef("active")


def test_pratt_is_null_between_in():
    stmt = Parser.parse_sql("""
    SELECT * FROM t
    WHERE col1 IS NOT NULL
      AND col2 BETWEEN 10 AND 20
      AND col3 IN ('a', 'b', 'c');
    """)
    where = stmt.where
    assert isinstance(where, BinaryOp)  # outer AND
    # Left of outer AND is (col1 IS NOT NULL AND col2 BETWEEN 10 AND 20)
    assert isinstance(where.left, BinaryOp)

    c3_in = where.right
    assert isinstance(c3_in, InList)
    assert c3_in.expr == ColumnRef("col3")
    assert len(c3_in.values) == 3
    assert c3_in.negated is False

    c2_between = where.left.right
    assert isinstance(c2_between, Between)
    assert c2_between.expr == ColumnRef("col2")
    assert c2_between.low == Literal(10)
    assert c2_between.high == Literal(20)

    c1_is_null = where.left.left
    assert isinstance(c1_is_null, IsNull)
    assert c1_is_null.expr == ColumnRef("col1") if hasattr(c1_is_null, "expr") else c1_is_null.operand == ColumnRef("col1")
    assert c1_is_null.negated is True


# ============================================================================
# Syntax Error Handling Tests
# ============================================================================

def test_syntax_error_provides_line_and_column():
    sql = "SELECT id, FROM users;"
    with pytest.raises(ParseError) as exc_info:
        Parser.parse_sql(sql)
    assert exc_info.value.line == 1
    assert exc_info.value.column == 12  # At 'FROM' where expression was expected
    assert "unexpected token 'FROM'" in str(exc_info.value)
