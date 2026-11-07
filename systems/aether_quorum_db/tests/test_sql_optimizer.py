"""Tests for SQL Query Planner, Rule-Based Optimizer, and Volcano physical operators."""


from systems.aether_quorum_db.sql.database import Database
from systems.aether_quorum_db.sql.optimizer import QueryPlanner
from systems.aether_quorum_db.sql.parser import Parser
from systems.aether_quorum_db.sql.physical_plan import (
    PhysicalHashJoin,
    PhysicalSeqScan,
)


def test_planner_builds_logical_plan():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT);")
    db.execute("CREATE TABLE orders (order_id INT PRIMARY KEY, user_id INT, amount INT);")

    stmt = Parser.parse_sql("""
    SELECT users.name, orders.amount
    FROM users
    INNER JOIN orders ON users.id = orders.user_id
    WHERE orders.amount > 50
    ORDER BY orders.amount DESC
    LIMIT 10;
    """)

    planner = QueryPlanner(db.catalog, db.tables)
    logical = planner.build_logical_plan(stmt)
    tree_str = logical.format_tree()

    assert "LogicalLimit(limit=10, offset=None)" in tree_str
    assert "LogicalSort(orders.amount DESC)" in tree_str
    assert "LogicalProject(users.name, orders.amount)" in tree_str
    assert "LogicalFilter(predicate=orders.amount > 50)" in tree_str
    assert "LogicalJoin(type=INNER" in tree_str


def test_optimizer_selects_primary_key_index_scan():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT);")

    stmt = Parser.parse_sql("SELECT name FROM users WHERE id = 42;")
    planner = QueryPlanner(db.catalog, db.tables)
    logical = planner.build_logical_plan(stmt)
    physical = planner.optimize(logical)
    tree_str = physical.format_tree()

    assert "IndexScan(table=users, index=PRIMARY, id = 42)" in tree_str


def test_optimizer_selects_secondary_index_scan():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, email TEXT);")
    db.execute("CREATE INDEX idx_email ON users (email);")

    stmt = Parser.parse_sql("SELECT id FROM users WHERE email = 'test@example.com';")
    planner = QueryPlanner(db.catalog, db.tables)
    logical = planner.build_logical_plan(stmt)
    physical = planner.optimize(logical)
    tree_str = physical.format_tree()

    assert "IndexScan(table=users, index=idx_email, email = 'test@example.com')" in tree_str


def test_optimizer_keeps_seq_scan_for_unindexed_columns():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT);")

    stmt = Parser.parse_sql("SELECT id FROM users WHERE name = 'Alice';")
    planner = QueryPlanner(db.catalog, db.tables)
    logical = planner.build_logical_plan(stmt)
    physical = planner.optimize(logical)
    tree_str = physical.format_tree()

    assert "SeqScan(table=users)" in tree_str


def test_optimizer_selects_hash_join_for_equi_join():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT);")
    db.execute("CREATE TABLE orders (order_id INT PRIMARY KEY, user_id INT, amount INT);")

    stmt = Parser.parse_sql("SELECT users.name, orders.amount FROM users INNER JOIN orders ON users.id = orders.user_id;")
    planner = QueryPlanner(db.catalog, db.tables)
    logical = planner.build_logical_plan(stmt)
    physical = planner.optimize(logical)
    tree_str = physical.format_tree()

    assert "HashJoin(users.id = orders.user_id)" in tree_str


def test_explain_statement_shows_physical_operator_tree():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, email TEXT);")
    db.execute("CREATE UNIQUE INDEX idx_email ON users (email);")

    res = db.execute("EXPLAIN SELECT id FROM users WHERE email = 'bob@example.com';")
    lines = [r[0] for r in res.rows]
    combined = "\n".join(lines)

    assert "IndexScan(table=users, index=idx_email" in combined


def test_volcano_hash_join_direct_execution():
    # Left table: (id, name)
    left_scan = PhysicalSeqScan(
        table_name="left",
        rows_supplier=lambda: [(1, "Alice"), (2, "Bob"), (3, "Charlie")],
    )
    # Right table: (user_id, item)
    right_scan = PhysicalSeqScan(
        table_name="right",
        rows_supplier=lambda: [(1, "Book"), (1, "Pen"), (2, "Laptop")],
    )

    hash_join = PhysicalHashJoin(
        left=left_scan,
        right=right_scan,
        left_key_fn=lambda r: r[0],
        right_key_fn=lambda r: r[0],
    )

    results = hash_join.execute_all()
    # Expected: (1, 'Alice', 1, 'Book'), (1, 'Alice', 1, 'Pen'), (2, 'Bob', 2, 'Laptop')
    assert len(results) == 3
    assert (1, "Alice", 1, "Book") in results
    assert (1, "Alice", 1, "Pen") in results
    assert (2, "Bob", 2, "Laptop") in results
