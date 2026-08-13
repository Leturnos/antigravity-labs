import sqlite3
import asyncio
import time
import json
from typing import List, Dict, Any, Optional

def _get_connection(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

async def init_board_db(db_path: str):
    def _create():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS collab_boards (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS collab_nodes (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                type TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                content TEXT NOT NULL,
                color TEXT NOT NULL,
                z_index INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT DEFAULT '{}',
                FOREIGN KEY (board_id) REFERENCES collab_boards (id) ON DELETE CASCADE
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS collab_connectors (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                from_node_id TEXT NOT NULL,
                to_node_id TEXT NOT NULL,
                label TEXT DEFAULT '',
                style TEXT DEFAULT 'orthogonal',
                color TEXT DEFAULT '#94a3b8',
                FOREIGN KEY (board_id) REFERENCES collab_boards (id) ON DELETE CASCADE
            );
        """)
        conn.commit()
        conn.close()
    await asyncio.to_thread(_create)

async def get_or_create_board(db_path: str, board_id: str, title: str = "Novo Quadro") -> Dict[str, Any]:
    await init_board_db(db_path)
    def _run():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM collab_boards WHERE id = ?", (board_id,))
        row = cursor.fetchone()
        now = time.time()
        if not row:
            cursor.execute("INSERT INTO collab_boards (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                           (board_id, title, now, now))
            conn.commit()
            row_dict = {"id": board_id, "title": title, "created_at": now, "updated_at": now}
        else:
            row_dict = dict(row)
        conn.close()
        return row_dict
    return await asyncio.to_thread(_run)

async def get_board_state(db_path: str, board_id: str) -> Dict[str, Any]:
    await init_board_db(db_path)
    def _run():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM collab_nodes WHERE board_id = ?", (board_id,))
        nodes = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM collab_connectors WHERE board_id = ?", (board_id,))
        connectors = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return {"nodes": nodes, "connectors": connectors}
    return await asyncio.to_thread(_run)

async def save_node(db_path: str, node_data: dict):
    await init_board_db(db_path)
    def _run():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO collab_nodes (id, board_id, type, x, y, width, height, content, color, z_index, metadata_json)
            VALUES (:id, :board_id, :type, :x, :y, :width, :height, :content, :color, :z_index, :metadata_json)
            ON CONFLICT(id) DO UPDATE SET
                x=excluded.x, y=excluded.y, width=excluded.width, height=excluded.height,
                content=excluded.content, color=excluded.color, z_index=excluded.z_index,
                metadata_json=excluded.metadata_json;
        """, node_data)
        conn.commit()
        conn.close()
    await asyncio.to_thread(_run)

async def delete_node(db_path: str, node_id: str):
    await init_board_db(db_path)
    def _run():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM collab_nodes WHERE id = ?", (node_id,))
        cursor.execute("DELETE FROM collab_connectors WHERE from_node_id = ? OR to_node_id = ?", (node_id, node_id))
        conn.commit()
        conn.close()
    await asyncio.to_thread(_run)

async def save_connector(db_path: str, conn_data: dict):
    await init_board_db(db_path)
    def _run():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO collab_connectors (id, board_id, from_node_id, to_node_id, label, style, color)
            VALUES (:id, :board_id, :from_node_id, :to_node_id, :label, :style, :color)
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label, style=excluded.style, color=excluded.color;
        """, conn_data)
        conn.commit()
        conn.close()
    await asyncio.to_thread(_run)

async def delete_connector(db_path: str, connector_id: str):
    await init_board_db(db_path)
    def _run():
        conn = _get_connection(db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM collab_connectors WHERE id = ?", (connector_id,))
        conn.commit()
        conn.close()
    await asyncio.to_thread(_run)
