"""FastAPI router exposing the Aether QuorumDB HTTP API."""

from __future__ import annotations

from fastapi import APIRouter

from .. import __version__

router = APIRouter(prefix="/api/quorum", tags=["quorum"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "Aether QuorumDB", "version": __version__}
