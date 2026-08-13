import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

import pytest
import sqlite3
from tools.aether_collab_board.backend.database import (
    init_board_db, get_or_create_board, get_board_state,
    save_node, delete_node, save_connector, delete_connector
)

@pytest.mark.asyncio
async def test_database_init_and_crud(tmp_path):
    db_file = str(tmp_path / "test_collab.db")
    await init_board_db(db_file)
    
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    assert "collab_boards" in tables
    assert "collab_nodes" in tables
    assert "collab_connectors" in tables
    conn.close()

    board = await get_or_create_board(db_file, "board_1", "Test Board")
    assert board["id"] == "board_1"
    assert board["title"] == "Test Board"

    node_data = {
        "id": "node_1",
        "board_id": "board_1",
        "type": "sticky",
        "x": 100.0,
        "y": 150.0,
        "width": 180.0,
        "height": 180.0,
        "content": "Test Sticky",
        "color": "#fef08a",
        "z_index": 1,
        "metadata_json": "{}"
    }
    await save_node(db_file, node_data)

    state = await get_board_state(db_file, "board_1")
    assert len(state["nodes"]) == 1
    assert state["nodes"][0]["content"] == "Test Sticky"

    conn_data = {
        "id": "conn_1",
        "board_id": "board_1",
        "from_node_id": "node_1",
        "to_node_id": "node_2",
        "label": "connects to",
        "style": "orthogonal",
        "color": "#94a3b8"
    }
    await save_connector(db_file, conn_data)

    state = await get_board_state(db_file, "board_1")
    assert len(state["connectors"]) == 1

    await delete_node(db_file, "node_1")
    state = await get_board_state(db_file, "board_1")
    assert len(state["nodes"]) == 0
    assert len(state["connectors"]) == 0
