from __future__ import annotations

import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from .db import get_db
from . import crud
# 로그인 관련 auth 임포트 삭제

DATA_DIR = Path(os.environ.get("KIDMORPH_DATA_DIR", "/data/jobs")).resolve()
FILES_MOUNT_PATH = "/files"

ALLOWED_PIPELINES = {"image_to_child", "smplx_to_child"}
ALLOWED_PRESETS = {"fast", "balanced", "quality"}

router = APIRouter(prefix="/api", tags=["jobs"])

def job_root(job_id: str) -> Path:
    return (DATA_DIR / "jobs" / job_id).resolve()

def safe_filename(name: str) -> str:
    return "".join(c for c in name if c.isalnum() or c in "._-")[:200] or "file"

# 💡 자물쇠(_user=Depends...) 삭제됨!
@router.get("/jobs")
def list_jobs(status: str | None = None, db: Session = Depends(get_db)):
    return {"items": crud.list_jobs(db, status=status)}

@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = crud.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    return job

@router.post("/jobs")
async def create_job(
    title: str | None = Form(None),
    pipelineType: str = Form(...),
    presetId: str = Form(...),
    sampleId: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    if pipelineType not in ALLOWED_PIPELINES:
        raise HTTPException(status_code=400, detail="invalid_pipelineType")
    if presetId not in ALLOWED_PRESETS:
        raise HTTPException(status_code=400, detail="invalid_presetId")

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    root = job_root(job_id)
    inputs_dir = root / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    input_filename = None
    input_content_type = None
    input_saved_path = None
    input_bytes = 0

    if file is not None:
        input_filename = safe_filename(file.filename or "upload.bin")
        input_content_type = file.content_type
        saved_path = inputs_dir / input_filename
        content = await file.read()
        saved_path.write_bytes(content)
        input_saved_path = str(saved_path)
        input_bytes = len(content)

    job = crud.create_job(
        db=db,
        job_id=job_id,
        title=(title or "").strip() or pipelineType,
        pipeline_type=pipelineType,
        preset_id=presetId,
        input_filename=input_filename,
        input_content_type=input_content_type,
        input_saved_path=input_saved_path,
        input_bytes=input_bytes,
    )
    # worker가 가져가 처리하므로 여기서는 queued만 반환
    return job

@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db)):
    ok = crud.delete_job(db, job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job_not_found")

    # 디스크 삭제(best-effort)
    root = job_root(job_id)
    try:
        if root.exists():
            shutil.rmtree(root)
    except Exception:
        pass

    return {"ok": True, "id": job_id}

