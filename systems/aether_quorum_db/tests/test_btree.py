"""Unit tests for the in-memory B+Tree implementation."""

import random

from systems.aether_quorum_db.sql.btree import BPlusTree


def test_btree_insert_and_get():
    tree = BPlusTree[int, str](degree=4)
    tree.insert(10, "ten")
    tree.insert(20, "twenty")
    tree.insert(5, "five")

    assert tree.get(10) == "ten"
    assert tree.get(20) == "twenty"
    assert tree.get(5) == "five"
    assert tree.get(99) is None
    assert 10 in tree
    assert 99 not in tree
    assert len(tree) == 3


def test_btree_update_existing_key():
    tree = BPlusTree[str, int](degree=3)
    tree["a"] = 1
    tree["b"] = 2
    assert tree["a"] == 1
    assert len(tree) == 2

    tree["a"] = 100
    assert tree["a"] == 100
    assert len(tree) == 2


def test_btree_range_scan():
    tree = BPlusTree[int, int](degree=4)
    items = [(i * 2, i * 10) for i in range(15)]
    for k, v in items:
        tree.insert(k, v)

    # Full range
    assert list(tree.items()) == items

    # Sliced range [6, 18]
    sliced = list(tree.items(low=6, high=18))
    expected = [(k, v) for k, v in items if 6 <= k <= 18]
    assert sliced == expected

    # Exclusive upper bound
    sliced_exc = list(tree.items(low=6, high=18, include_high=False))
    expected_exc = [(k, v) for k, v in items if 6 <= k < 18]
    assert sliced_exc == expected_exc


def test_btree_large_random_dataset_against_dict():
    rng = random.Random(42)
    tree = BPlusTree[int, int](degree=5)
    oracle: dict[int, int] = {}

    keys = list(range(1000))
    rng.shuffle(keys)

    for k in keys:
        v = k * 3
        tree.insert(k, v)
        oracle[k] = v

    assert len(tree) == len(oracle)

    for k in keys:
        assert tree.get(k) == oracle[k]

    # Test full sorted items
    assert list(tree.items()) == sorted(oracle.items())

    # Test range query
    low, high = 250, 750
    expected_range = [(k, oracle[k]) for k in sorted(oracle.keys()) if low <= k <= high]
    assert list(tree.items(low=low, high=high)) == expected_range

    # Deletions
    del_keys = keys[:200]
    for k in del_keys:
        assert tree.delete(k) is True
        del oracle[k]

    assert len(tree) == len(oracle)
    assert list(tree.items()) == sorted(oracle.items())

    for k in del_keys:
        assert tree.get(k) is None
        assert tree.delete(k) is False
