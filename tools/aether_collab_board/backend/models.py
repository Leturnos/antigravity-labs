from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class BoardSchema(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float

class NodeSchema(BaseModel):
    id: str
    board_id: str
    type: str  # 'sticky', 'mermaid', 'frame'
    x: float
    y: float
    width: float
    height: float
    content: str
    color: str = "#fef08a"
    z_index: int = 1
    metadata_json: Optional[str] = "{}"

class ConnectorSchema(BaseModel):
    id: str
    board_id: str
    from_node_id: str
    to_node_id: str
    label: str = ""
    style: str = "orthogonal"  # 'orthogonal', 'curved', 'straight'
    color: str = "#94a3b8"

class WSMessageSchema(BaseModel):
    type: str
    room_id: str
    user_id: Optional[str] = None
    data: Dict[str, Any]
