"""Mock Engine for Aether API Workbench.

Provides fake data generation from JSON Schemas with semantic inferencing
and a dynamic FastAPI router for serving mock API endpoints.
"""

import asyncio
import json
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .database import get_db
from .models import MockEndpoint

mock_router = APIRouter()

JSON_SCHEMA_TYPES = {"object", "array", "string", "number", "integer", "boolean", "null"}


def generate_fake_from_schema(schema_dict: dict, key_name: str = "") -> Any:
    """Generate realistic fake data from a JSON Schema dictionary using semantic inferencing."""
    if not isinstance(schema_dict, dict):
        return None

    # Handle direct overrides
    if "const" in schema_dict:
        return schema_dict["const"]
    if "example" in schema_dict:
        return schema_dict["example"]
    if "default" in schema_dict:
        return schema_dict["default"]
    if "enum" in schema_dict and isinstance(schema_dict["enum"], list) and len(schema_dict["enum"]) > 0:
        return schema_dict["enum"][0]

    schema_type = schema_dict.get("type")

    # Infer type if missing but structural keys exist
    if not schema_type:
        if "properties" in schema_dict:
            schema_type = "object"
        elif "items" in schema_dict:
            schema_type = "array"

    key_lower = key_name.lower()

    if schema_type == "object" or "properties" in schema_dict:
        properties = schema_dict.get("properties", {})
        result = {}
        for prop_name, prop_schema in properties.items():
            result[prop_name] = generate_fake_from_schema(prop_schema, key_name=prop_name)
        return result

    elif schema_type == "array" or "items" in schema_dict:
        items_schema = schema_dict.get("items", {})
        if not items_schema:
            return []
        item_val = generate_fake_from_schema(items_schema, key_name=key_name)
        return [item_val]

    elif schema_type == "string":
        fmt = schema_dict.get("format", "")
        if isinstance(fmt, str):
            fmt = fmt.lower()
        else:
            fmt = ""

        if fmt == "email" or "email" in key_lower:
            return "user@example.com"
        elif fmt == "uuid" or key_lower in ("id", "uuid", "guid") or key_lower.endswith("_id"):
            return "123e4567-e89b-12d3-a456-426614174000"
        elif fmt in ("date-time", "datetime") or key_lower in ("created_at", "updated_at", "date", "timestamp"):
            return "2026-01-01T12:00:00Z"
        elif fmt == "date":
            return "2026-01-01"
        elif fmt in ("uri", "url") or key_lower in ("url", "uri", "link", "avatar", "image"):
            return "https://example.com/resource"
        elif "phone" in key_lower or "tel" in key_lower:
            return "+1-555-0199"
        elif any(k in key_lower for k in ("first_name", "given_name")):
            return "John"
        elif any(k in key_lower for k in ("last_name", "family_name", "surname")):
            return "Doe"
        elif any(k in key_lower for k in ("name", "author", "user", "username")):
            return "Jane Doe"
        elif any(k in key_lower for k in ("title", "subject", "heading")):
            return "Sample Title"
        elif any(k in key_lower for k in ("description", "summary", "detail", "bio", "content", "message", "text")):
            return "This is a sample description text."
        elif "status" in key_lower:
            return "active"
        elif "city" in key_lower:
            return "New York"
        elif "country" in key_lower:
            return "United States"
        else:
            return f"sample_{key_name}" if key_name else "sample_string"

    elif schema_type in ("integer", "int"):
        if key_lower == "id" or key_lower.endswith("_id") or key_lower in ("count", "total", "quantity", "number"):
            return 1
        elif "age" in key_lower:
            return 30
        elif "port" in key_lower:
            return 8080
        return 100

    elif schema_type in ("number", "float"):
        if any(k in key_lower for k in ("price", "amount", "cost", "total", "rate", "score", "rating")):
            return 99.99
        return 1.0

    elif schema_type == "boolean":
        if any(k in key_lower for k in ("active", "enabled", "is_", "has_")):
            return True
        return True

    elif schema_type == "null":
        return None

    return "sample_value"


@mock_router.api_route("/mock/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def handle_mock_request(request: Request, path: str, db: Session = Depends(get_db)):
    """Handle incoming request by matching path and method against active MockEndpoints."""
    req_method = request.method.upper()
    clean_path = path.strip("/")

    path_without_mock = clean_path
    if clean_path.startswith("mock/"):
        path_without_mock = clean_path[5:].strip("/")

    candidate_paths = list(
        {
            f"/{clean_path}",
            clean_path,
            f"/mock/{clean_path}",
            f"mock/{clean_path}",
            f"/{path_without_mock}",
            path_without_mock,
            f"/mock/{path_without_mock}",
            f"mock/{path_without_mock}",
        }
    )

    mock_ep = (
        db.query(MockEndpoint)
        .filter(
            MockEndpoint.is_active == True,
            MockEndpoint.method == req_method,
            MockEndpoint.path.in_(candidate_paths),
        )
        .first()
    )

    if not mock_ep:
        raise HTTPException(
            status_code=404,
            detail=f"Mock endpoint not found for method '{req_method}' and path '{path}'",
        )

    # Delay handling
    if mock_ep.delay_ms and mock_ep.delay_ms > 0:
        await asyncio.sleep(mock_ep.delay_ms / 1000.0)

    # Header handling
    headers: Dict[str, str] = {}
    if mock_ep.response_headers:
        try:
            if isinstance(mock_ep.response_headers, str):
                headers = json.loads(mock_ep.response_headers)
            elif isinstance(mock_ep.response_headers, dict):
                headers = mock_ep.response_headers
        except Exception:
            headers = {}

    status_code = mock_ep.status_code or 200
    body_str = mock_ep.response_body or ""

    if not body_str.strip():
        return Response(content="", status_code=status_code, headers=headers)

    try:
        parsed_body = json.loads(body_str)
        if isinstance(parsed_body, dict):
            has_schema_key = "$schema" in parsed_body
            has_properties = "properties" in parsed_body
            has_valid_type = parsed_body.get("type") in JSON_SCHEMA_TYPES

            if has_schema_key or has_properties or has_valid_type:
                generated_content = generate_fake_from_schema(parsed_body)
                return JSONResponse(content=generated_content, status_code=status_code, headers=headers)

        return JSONResponse(content=parsed_body, status_code=status_code, headers=headers)
    except (json.JSONDecodeError, TypeError):
        return Response(content=body_str, status_code=status_code, headers=headers, media_type="text/plain")
