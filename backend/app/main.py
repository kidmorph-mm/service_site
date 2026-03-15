# app/main.py
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import ensure_tables

from .jobs_api import router as jobs_router

try:
    from .workers_api import router as workers_router  # type: ignore
except ModuleNotFoundError:
    workers_router = None  # noqa: F841


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_cors_origins(raw: str) -> List[str]:
    s = (raw or "").strip()
    if not s:
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ]
    if s == "*":
        return ["*"]
    return [x.strip() for x in s.split(",") if x.strip()]


def pick_device() -> str:
    """Lightweight device picker for /api/config (doesn't import worker stack)."""
    forced = os.environ.get("KIDMORPH_DEVICE", "").strip().lower()
    if forced in ("cpu", "cuda"):
        if forced == "cuda":
            try:
                import torch  # type: ignore
                if torch.cuda.is_available():
                    return "cuda"
            except Exception:
                pass
            return "cpu"
        return "cpu"
    # auto
    try:
        import torch  # type: ignore
        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


# ===== Paths =====
DATA_DIR = Path(os.environ.get("KIDMORPH_DATA_DIR", "/data/jobs")).resolve()
FILES_MOUNT_PATH = os.environ.get("KIDMORPH_FILES_MOUNT_PATH", "/files")

ALLOWED_PIPELINES = {"image_to_child", "smplx_to_child"}
ALLOWED_PRESETS = {"fast", "balanced", "quality"}

app = FastAPI(title="KidMorph Backend v1")


@app.on_event("startup")
def _on_startup() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ensure_tables()


cors_origins = _parse_cors_origins(os.environ.get("KIDMORPH_CORS_ORIGINS", ""))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(FILES_MOUNT_PATH, StaticFiles(directory=str(DATA_DIR), html=False), name="files")


@app.get("/health")
def health():
    return {"ok": True, "time": utc_now_iso()}


@app.get("/api/config")
def get_config():
    return {
        "ok": True,
        "time": utc_now_iso(),
        "dataDir": str(DATA_DIR),
        "allowedPipelines": sorted(list(ALLOWED_PIPELINES)),
        "allowedPresets": sorted(list(ALLOWED_PRESETS)),
        "filesMountPath": FILES_MOUNT_PATH,
        "device": pick_device(),
        "version": "v1",
    }


app.include_router(jobs_router)

if workers_router is not None:
    app.include_router(workers_router)
