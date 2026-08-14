"""Main FastAPI application for Aether API Workbench."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .database import get_db, init_db
from .mock_engine import mock_router
from .models import Collection, HistoryLog, MockEndpoint, SavedRequest
from .proxy import proxy_router
from .schemas import (
    CollectionCreate,
    CollectionOut,
    CollectionUpdate,
    MockEndpointCreate,
    MockEndpointOut,
    MockEndpointUpdate,
    SavedRequestCreate,
    SavedRequestOut,
    SavedRequestUpdate,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle event handler for database initialization and cleanup."""
    init_db()
    yield


app = FastAPI(
    title="Aether API Workbench & Mock Server",
    description="High-performance API testing tool and mock server backend.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Proxy router under /api/proxy
app.include_router(proxy_router, prefix="/api/proxy", tags=["proxy"])


# ==================== Health Check & Static Files ====================

@app.get("/api/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "Aether API Workbench"}


# Static files directory mounting
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        index_file.write_text(
            "<!DOCTYPE html><html><head><title>Aether API Workbench</title></head>"
            "<body><h1>Aether API Workbench</h1></body></html>",
            encoding="utf-8",
        )

app.mount("/static", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


# ==================== Collection Endpoints ====================

@app.post("/api/collections", response_model=CollectionOut, status_code=status.HTTP_201_CREATED, tags=["collections"])
def create_collection(collection_in: CollectionCreate, db: Session = Depends(get_db)):
    """Create a new API request collection."""
    db_obj = Collection(name=collection_in.name, description=collection_in.description)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@app.get("/api/collections", response_model=List[CollectionOut], tags=["collections"])
def list_collections(db: Session = Depends(get_db)):
    """List all API request collections."""
    return db.query(Collection).all()


@app.get("/api/collections/{collection_id}", response_model=CollectionOut, tags=["collections"])
def get_collection(collection_id: int, db: Session = Depends(get_db)):
    """Get a single collection by ID."""
    db_obj = db.query(Collection).filter(Collection.id == collection_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Collection not found")
    return db_obj


@app.put("/api/collections/{collection_id}", response_model=CollectionOut, tags=["collections"])
def update_collection(
    collection_id: int, collection_in: CollectionUpdate, db: Session = Depends(get_db)
):
    """Update an existing collection."""
    db_obj = db.query(Collection).filter(Collection.id == collection_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Collection not found")

    update_data = collection_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    db.commit()
    db.refresh(db_obj)
    return db_obj


@app.delete("/api/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["collections"])
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    """Delete a collection by ID."""
    db_obj = db.query(Collection).filter(Collection.id == collection_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Collection not found")

    db.delete(db_obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==================== SavedRequest Endpoints ====================

@app.post("/api/saved-requests", response_model=SavedRequestOut, status_code=status.HTTP_201_CREATED, tags=["saved_requests"])
@app.post("/api/saved_requests", response_model=SavedRequestOut, status_code=status.HTTP_201_CREATED, tags=["saved_requests"])
def create_saved_request(request_in: SavedRequestCreate, db: Session = Depends(get_db)):
    """Create a new saved HTTP request."""
    if request_in.collection_id is not None:
        collection = db.query(Collection).filter(Collection.id == request_in.collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

    db_obj = SavedRequest(
        collection_id=request_in.collection_id,
        name=request_in.name,
        method=request_in.method.upper(),
        url=request_in.url,
        headers=request_in.headers,
        params=request_in.params,
        body=request_in.body,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@app.get("/api/saved-requests", response_model=List[SavedRequestOut], tags=["saved_requests"])
@app.get("/api/saved_requests", response_model=List[SavedRequestOut], tags=["saved_requests"])
def list_saved_requests(collection_id: Optional[int] = None, db: Session = Depends(get_db)):
    """List saved requests with optional collection_id filter."""
    query = db.query(SavedRequest)
    if collection_id is not None:
        query = query.filter(SavedRequest.collection_id == collection_id)
    return query.all()


@app.get("/api/saved-requests/{request_id}", response_model=SavedRequestOut, tags=["saved_requests"])
@app.get("/api/saved_requests/{request_id}", response_model=SavedRequestOut, tags=["saved_requests"])
def get_saved_request(request_id: int, db: Session = Depends(get_db)):
    """Get a saved request by ID."""
    db_obj = db.query(SavedRequest).filter(SavedRequest.id == request_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Saved request not found")
    return db_obj


@app.put("/api/saved-requests/{request_id}", response_model=SavedRequestOut, tags=["saved_requests"])
@app.put("/api/saved_requests/{request_id}", response_model=SavedRequestOut, tags=["saved_requests"])
def update_saved_request(
    request_id: int, request_in: SavedRequestUpdate, db: Session = Depends(get_db)
):
    """Update an existing saved request."""
    db_obj = db.query(SavedRequest).filter(SavedRequest.id == request_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Saved request not found")

    if request_in.collection_id is not None:
        collection = db.query(Collection).filter(Collection.id == request_in.collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

    update_data = request_in.model_dump(exclude_unset=True)
    if "method" in update_data and update_data["method"]:
        update_data["method"] = update_data["method"].upper()

    for field, value in update_data.items():
        setattr(db_obj, field, value)

    db.commit()
    db.refresh(db_obj)
    return db_obj


@app.delete("/api/saved-requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["saved_requests"])
@app.delete("/api/saved_requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["saved_requests"])
def delete_saved_request(request_id: int, db: Session = Depends(get_db)):
    """Delete a saved request by ID."""
    db_obj = db.query(SavedRequest).filter(SavedRequest.id == request_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Saved request not found")

    db.delete(db_obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==================== MockEndpoint Endpoints ====================

@app.post("/api/mock-endpoints", response_model=MockEndpointOut, status_code=status.HTTP_201_CREATED, tags=["mock_endpoints"])
@app.post("/api/mock_endpoints", response_model=MockEndpointOut, status_code=status.HTTP_201_CREATED, tags=["mock_endpoints"])
def create_mock_endpoint(endpoint_in: MockEndpointCreate, db: Session = Depends(get_db)):
    """Create a new mock endpoint."""
    path = endpoint_in.path.strip()
    if not path.startswith("/"):
        path = f"/{path}"

    db_obj = MockEndpoint(
        name=endpoint_in.name,
        path=path,
        method=endpoint_in.method.upper(),
        status_code=endpoint_in.status_code,
        response_headers=endpoint_in.response_headers,
        response_body=endpoint_in.response_body,
        delay_ms=endpoint_in.delay_ms,
        is_active=endpoint_in.is_active,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@app.get("/api/mock-endpoints", response_model=List[MockEndpointOut], tags=["mock_endpoints"])
@app.get("/api/mock_endpoints", response_model=List[MockEndpointOut], tags=["mock_endpoints"])
def list_mock_endpoints(db: Session = Depends(get_db)):
    """List all mock endpoints."""
    return db.query(MockEndpoint).all()


@app.get("/api/mock-endpoints/{endpoint_id}", response_model=MockEndpointOut, tags=["mock_endpoints"])
@app.get("/api/mock_endpoints/{endpoint_id}", response_model=MockEndpointOut, tags=["mock_endpoints"])
def get_mock_endpoint(endpoint_id: int, db: Session = Depends(get_db)):
    """Get a mock endpoint by ID."""
    db_obj = db.query(MockEndpoint).filter(MockEndpoint.id == endpoint_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Mock endpoint not found")
    return db_obj


@app.put("/api/mock-endpoints/{endpoint_id}", response_model=MockEndpointOut, tags=["mock_endpoints"])
@app.put("/api/mock_endpoints/{endpoint_id}", response_model=MockEndpointOut, tags=["mock_endpoints"])
def update_mock_endpoint(
    endpoint_id: int, endpoint_in: MockEndpointUpdate, db: Session = Depends(get_db)
):
    """Update an existing mock endpoint."""
    db_obj = db.query(MockEndpoint).filter(MockEndpoint.id == endpoint_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Mock endpoint not found")

    update_data = endpoint_in.model_dump(exclude_unset=True)
    if "path" in update_data and update_data["path"]:
        path = update_data["path"].strip()
        if not path.startswith("/"):
            path = f"/{path}"
        update_data["path"] = path
    if "method" in update_data and update_data["method"]:
        update_data["method"] = update_data["method"].upper()

    for field, value in update_data.items():
        setattr(db_obj, field, value)

    db.commit()
    db.refresh(db_obj)
    return db_obj


@app.delete("/api/mock-endpoints/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["mock_endpoints"])
@app.delete("/api/mock_endpoints/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["mock_endpoints"])
def delete_mock_endpoint(endpoint_id: int, db: Session = Depends(get_db)):
    """Delete a mock endpoint by ID."""
    db_obj = db.query(MockEndpoint).filter(MockEndpoint.id == endpoint_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Mock endpoint not found")

    db.delete(db_obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==================== History Log Endpoints ====================

@app.get("/api/history", tags=["history"])
def list_history_logs(limit: int = 50, db: Session = Depends(get_db)):
    """List execution history logs ordered by creation timestamp descending."""
    logs = (
        db.query(HistoryLog)
        .order_by(HistoryLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "request_method": log.request_method,
            "request_url": log.request_url,
            "request_headers": log.request_headers,
            "request_body": log.request_body,
            "response_status": log.response_status,
            "response_headers": log.response_headers,
            "response_body": log.response_body,
            "execution_time_ms": log.execution_time_ms,
            "is_mock": log.is_mock,
            "created_at": log.created_at,
        }
        for log in logs
    ]


@app.delete("/api/history", status_code=status.HTTP_204_NO_CONTENT, tags=["history"])
def clear_history_logs(db: Session = Depends(get_db)):
    """Clear all execution history logs."""
    db.query(HistoryLog).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/api/history/{history_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["history"])
def delete_history_log(history_id: int, db: Session = Depends(get_db)):
    """Delete a specific history log entry by ID."""
    db_obj = db.query(HistoryLog).filter(HistoryLog.id == history_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="History log entry not found")

    db.delete(db_obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Include Mock Router for dynamic fake endpoint handling (included last)
app.include_router(mock_router, tags=["mock"])
