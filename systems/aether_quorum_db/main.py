"""Standalone FastAPI application for Aether QuorumDB."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api.router import router as quorum_router

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Aether QuorumDB",
    description="Distributed SQL database on a handwritten Raft consensus core",
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quorum_router)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/static/index.html")
