"""Integration tests for Aether Storage Internals FastAPI endpoints."""

import unittest
from fastapi.testclient import TestClient
from systems.aether_storage_internals.main import app


class TestStorageAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_check(self):
        resp = self.client.get("/api/storage/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")

    def test_put_get_delete_cycle(self):
        # 1. PUT
        put_resp = self.client.post("/api/storage/kv", json={"key": "api_test_key", "value": "api_test_val"})
        self.assertEqual(put_resp.status_code, 200)
        self.assertEqual(put_resp.json()["key"], "api_test_key")

        # 2. GET
        get_resp = self.client.get("/api/storage/kv/api_test_key")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["value"], "api_test_val")

        # 3. TRACE
        trace_resp = self.client.get("/api/storage/trace/api_test_key")
        self.assertEqual(trace_resp.status_code, 200)
        self.assertTrue(trace_resp.json()["found"])

        # 4. DELETE
        del_resp = self.client.delete("/api/storage/kv/api_test_key")
        self.assertEqual(del_resp.status_code, 200)

        # 5. GET absent
        absent_resp = self.client.get("/api/storage/kv/api_test_key")
        self.assertEqual(absent_resp.status_code, 404)

    def test_actions_and_state(self):
        # Insert a record
        self.client.post("/api/storage/kv", json={"key": "state_k", "value": "state_v"})

        # Get state
        state_resp = self.client.get("/api/storage/state")
        self.assertEqual(state_resp.status_code, 200)
        state = state_resp.json()
        self.assertIn("active_memtable", state)
        self.assertIn("wal", state)
        self.assertIn("levels", state)

        # Trigger Flush
        flush_resp = self.client.post("/api/storage/actions/flush")
        self.assertEqual(flush_resp.status_code, 200)

        # Trigger Compaction
        comp_resp = self.client.post("/api/storage/actions/compact?source_level=0")
        self.assertEqual(comp_resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
