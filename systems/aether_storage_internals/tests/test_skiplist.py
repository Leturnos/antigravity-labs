"""Unit tests for SkipList data structure."""

import unittest
from systems.aether_storage_internals.engine.skiplist import SkipList
from systems.aether_storage_internals.engine.types import Record


class TestSkipList(unittest.TestCase):

    def setUp(self):
        self.sl = SkipList(max_level=12, p=0.5)

    def test_insert_and_get(self):
        rec1 = Record(key=b"alpha", value=b"val_alpha")
        rec2 = Record(key=b"beta", value=b"val_beta")
        rec3 = Record(key=b"gamma", value=b"val_gamma")

        self.sl.insert(rec1)
        self.sl.insert(rec2)
        self.sl.insert(rec3)

        self.assertEqual(len(self.sl), 3)
        self.assertEqual(self.sl.get(b"alpha").value, b"val_alpha")
        self.assertEqual(self.sl.get(b"beta").value, b"val_beta")
        self.assertEqual(self.sl.get(b"gamma").value, b"val_gamma")
        self.assertIsNone(self.sl.get(b"omega"))

    def test_update_existing_key(self):
        rec1 = Record(key=b"key1", value=b"first")
        is_update, _ = self.sl.insert(rec1)
        self.assertFalse(is_update)

        rec2 = Record(key=b"key1", value=b"second")
        is_update, _ = self.sl.insert(rec2)
        self.assertTrue(is_update)
        self.assertEqual(len(self.sl), 1)
        self.assertEqual(self.sl.get(b"key1").value, b"second")

    def test_ordered_iteration(self):
        keys = [b"z", b"a", b"m", b"b", b"c"]
        for k in keys:
            self.sl.insert(Record(key=k, value=b"v"))

        sorted_keys = [r.key for r in self.sl]
        self.assertEqual(sorted_keys, [b"a", b"b", b"c", b"m", b"z"])

    def test_range_scan(self):
        for i in range(10):
            self.sl.insert(Record(key=f"k{i:02d}".encode(), value=f"v{i}".encode()))

        # Scan k02 to k06
        res = self.sl.scan(start_key=b"k02", end_key=b"k06")
        res_keys = [r.key for r in res]
        self.assertEqual(res_keys, [b"k02", b"k03", b"k04", b"k05"])

    def test_export_graph(self):
        self.sl.insert(Record(key=b"node1", value=b"v1"))
        self.sl.insert(Record(key=b"node2", value=b"v2"))
        graph = self.sl.export_graph()
        self.assertEqual(graph["total_nodes"], 2)
        self.assertEqual(len(graph["nodes"]), 2)
        self.assertEqual(graph["nodes"][0]["key"], "node1")


if __name__ == "__main__":
    unittest.main()
