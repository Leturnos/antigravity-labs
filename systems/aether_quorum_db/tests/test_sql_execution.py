"""Integration tests for SQL database execution and B+Tree storage engine."""

import pytest

from systems.aether_quorum_db.sql.database import (
    ConstraintViolation,
    Database,
)


def test_create_table_insert_and_select():
    db = Database()
    db.execute("""
    CREATE TABLE users (
        id INT PRIMARY KEY,
        name TEXT NOT NULL,
        score FLOAT DEFAULT 0.0,
        active BOOL DEFAULT true
    );
    """)

    res = db.execute("INSERT INTO users (id, name, score, active) VALUES (1, 'Alice', 95.5, true), (2, 'Bob', 80.0, false);")
    assert res.rows == [(2,)]

    query_res = db.execute("SELECT id, name, score FROM users WHERE active = true;")
    assert query_res.columns == ["id", "name", "score"]
    assert query_res.rows == [(1, "Alice", 95.5)]


def test_primary_key_uniqueness_enforced():
    db = Database()
    db.execute("CREATE TABLE items (id INT PRIMARY KEY, name TEXT);")
    db.execute("INSERT INTO items (id, name) VALUES (1, 'Sword');")

    with pytest.raises(ConstraintViolation) as exc_info:
        db.execute("INSERT INTO items (id, name) VALUES (1, 'Shield');")
    assert "Duplicate primary key" in str(exc_info.value)


def test_not_null_constraint_enforced():
    db = Database()
    db.execute("CREATE TABLE items (id INT PRIMARY KEY, name TEXT NOT NULL);")

    with pytest.raises(ConstraintViolation) as exc_info:
        db.execute("INSERT INTO items (id, name) VALUES (1, NULL);")
    assert "NOT NULL constraint violated" in str(exc_info.value)


def test_unique_secondary_index_enforced():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, email TEXT);")
    db.execute("CREATE UNIQUE INDEX idx_email ON users (email);")

    db.execute("INSERT INTO users (id, email) VALUES (1, 'alice@example.com');")

    with pytest.raises(ConstraintViolation) as exc_info:
        db.execute("INSERT INTO users (id, email) VALUES (2, 'alice@example.com');")
    assert "Unique constraint violated" in str(exc_info.value)


def test_update_and_delete_rows():
    db = Database()
    db.execute("CREATE TABLE products (id INT PRIMARY KEY, name TEXT, price INT);")
    db.execute("INSERT INTO products (id, name, price) VALUES (1, 'Book', 20), (2, 'Pen', 5), (3, 'Notebook', 15);")

    # UPDATE
    upd_res = db.execute("UPDATE products SET price = 25 WHERE id = 1;")
    assert upd_res.rows == [(1,)]

    q = db.execute("SELECT price FROM products WHERE id = 1;")
    assert q.rows == [(25,)]

    # DELETE
    del_res = db.execute("DELETE FROM products WHERE price < 20;")
    assert del_res.rows == [(2,)]  # deleted id 2 and 3

    remaining = db.execute("SELECT id FROM products;")
    assert remaining.rows == [(1,)]


def test_inner_join_execution():
    db = Database()
    db.execute("CREATE TABLE users (id INT PRIMARY KEY, name TEXT);")
    db.execute("CREATE TABLE orders (order_id INT PRIMARY KEY, user_id INT, amount INT);")

    db.execute("INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');")
    db.execute("INSERT INTO orders (order_id, user_id, amount) VALUES (10, 1, 100), (20, 1, 250), (30, 2, 75);")

    res = db.execute("""
    SELECT users.name, orders.amount
    FROM users
    INNER JOIN orders ON users.id = orders.user_id
    WHERE orders.amount >= 100;
    """)
    assert res.columns == ["users.name", "orders.amount"]
    assert set(res.rows) == {("Alice", 100), ("Alice", 250)}


def test_group_by_having_and_aggregations():
    db = Database()
    db.execute("CREATE TABLE sales (id INT PRIMARY KEY, dept TEXT, amount INT);")
    db.execute("""
    INSERT INTO sales (id, dept, amount) VALUES
        (1, 'Books', 10),
        (2, 'Books', 20),
        (3, 'Electronics', 100),
        (4, 'Electronics', 200),
        (5, 'Food', 5);
    """)

    res = db.execute("""
    SELECT dept, COUNT(*), SUM(amount), AVG(amount), MIN(amount), MAX(amount)
    FROM sales
    GROUP BY dept
    HAVING COUNT(*) >= 2;
    """)
    # Books: count=2, sum=30, avg=15.0, min=10, max=20
    # Electronics: count=2, sum=300, avg=150.0, min=100, max=200
    rows_by_dept = {r[0]: r[1:] for r in res.rows}
    assert "Food" not in rows_by_dept
    assert rows_by_dept["Books"] == (2, 30, 15.0, 10, 20)
    assert rows_by_dept["Electronics"] == (2, 300, 150.0, 100, 200)


def test_order_by_limit_offset():
    db = Database()
    db.execute("CREATE TABLE items (id INT PRIMARY KEY, name TEXT);")
    for i in range(10):
        db.execute(f"INSERT INTO items (id, name) VALUES ({i}, 'item_{i}');")

    res = db.execute("SELECT id FROM items ORDER BY id DESC LIMIT 3 OFFSET 2;")
    assert res.rows == [(7,), (6,), (5,)]


def test_database_snapshot_and_recovery():
    db1 = Database()
    db1.execute("CREATE TABLE accounts (id INT PRIMARY KEY, owner TEXT, balance INT);")
    db1.execute("CREATE INDEX idx_owner ON accounts (owner);")
    db1.execute("INSERT INTO accounts (id, owner, balance) VALUES (1, 'Alice', 500), (2, 'Bob', 300);")

    snapshot_bytes = db1.create_snapshot()
    assert len(snapshot_bytes) > 0

    # Restore in completely fresh database instance
    db2 = Database()
    db2.restore_snapshot(snapshot_bytes)

    res = db2.execute("SELECT id, owner, balance FROM accounts WHERE balance >= 400;")
    assert res.rows == [(1, "Alice", 500)]

    # Verify secondary index was also rebuilt and enforces uniqueness or lookups
    tbl = db2.tables["accounts"]
    assert "idx_owner" in tbl.secondary_indexes
    assert 1 in tbl.secondary_indexes["idx_owner"].get("Alice")
