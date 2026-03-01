from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


# =========================
# Config
# =========================
def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DATA_DIR = Path(os.environ.get("KIDMORPH_DATA_DIR", "/data/jobs")).resolve()
META_DIR = DATA_DIR / "_meta"
STATE_PATH = META_DIR / "jobs.json"

# 파일 서빙 base: /files/...
FILES_MOUNT_PATH = "/files"

# 프론트 v1과 일치
ALLOWED_PIPELINES = {"image_to_child", "smplx_to_child"}

# v1에서는 UI에서 preset을 숨겨도, 백엔드는 받도록 유지(기본 balanced)
ALLOWED_PRESETS = {"fast", "balanced", "quality"}


# =========================
# Persistence (JSON file)
# =========================
def _ensure_dirs() -> None:
    META_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "jobs").mkdir(parents=True, exist_ok=True)


def _load_state() -> Dict[str, Any]:
    _ensure_dirs()
    if not STATE_PATH.exists():
        return {"jobs": {}}  # job_id -> job dict
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        # 손상 시 백업
        bak = STATE_PATH.with_suffix(".bak")
        try:
            shutil.copy2(STATE_PATH, bak)
        except Exception:
            pass
        return {"jobs": {}}


def _save_state(state: Dict[str, Any]) -> None:
    _ensure_dirs()
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_PATH)


def _get_job_or_404(state: Dict[str, Any], job_id: str) -> Dict[str, Any]:
    job = state.get("jobs", {}).get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    return job


# =========================
# Artifacts helpers
# =========================
def _job_root(job_id: str) -> Path:
    return (DATA_DIR / "jobs" / job_id).resolve()


def _rel_to_files_url(path: Path) -> str:
    # DATA_DIR 기준으로 상대경로 -> /files/...
    rel = path.resolve().relative_to(DATA_DIR)
    return f"{FILES_MOUNT_PATH}/{rel.as_posix()}"


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _write_cube_obj(path: Path, scale: float = 1.0) -> None:
    # 아주 단순한 cube OBJ (데모용)
    s = scale
    obj = f"""# cube obj (demo)
o cube
v {-s} {-s} {-s}
v { s} {-s} {-s}
v { s} { s} {-s}
v {-s} { s} {-s}
v {-s} {-s} { s}
v { s} {-s} { s}
v { s} { s} { s}
v {-s} { s} { s}
f 1 2 3 4
f 5 6 7 8
f 1 5 8 4
f 2 6 7 3
f 4 3 7 8
f 1 2 6 5
"""
    _write_text(path, obj)


def _safe_filename(name: str) -> str:
    # 매우 단순한 sanitize
    return "".join(c for c in name if c.isalnum() or c in "._-")[:200] or "file"


def _write_pdf(path: Path, title: str, lines: list[str]) -> None:
    """
    reportlab로 "진짜 PDF" 생성 (브라우저에서 정상 표시)
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4

    y = height - 72
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, y, title)
    y -= 26

    c.setFont("Helvetica", 11)
    for line in lines:
        if y < 72:
            c.showPage()
            y = height - 72
            c.setFont("Helvetica", 11)
        c.drawString(72, y, line)
        y -= 16

    c.showPage()
    c.save()


# =========================
# Mock processing (v1)
# =========================
async def _mock_process_job(job_id: str) -> None:
    """
    실제 모델 실행 대신:
    - progress 업데이트
    - artifacts 생성(obj/log/report + summary.json)
    """
    state = _load_state()
    job = _get_job_or_404(state, job_id)

    job_root = _job_root(job_id)
    artifacts_dir = job_root / "artifacts"
    reports_dir = job_root / "reports"
    logs_dir = job_root / "logs"

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    step_times: Dict[str, float] = {}

    def update(status: str, progress: float, message: str = ""):
        st = _load_state()
        j = _get_job_or_404(st, job_id)
        j["status"] = status
        j["progress"] = max(0.0, min(1.0, progress))
        j["message"] = message
        j["updatedAt"] = utc_now_iso()
        _save_state(st)

    update("running", 0.05, "started")

    # 로그 누적
    log_path = logs_dir / "run.log"
    _write_text(log_path, "[start] job running\n")

    # preprocess
    t_pre0 = time.perf_counter()
    await asyncio.sleep(0.3)
    step_times["preprocess_s"] = round(time.perf_counter() - t_pre0, 4)
    _write_text(log_path, _read_text(log_path) + "[step] preprocess done\n")
    update("running", 0.30, "preprocess")

    # reconstruction
    t_rec0 = time.perf_counter()
    await asyncio.sleep(0.3)
    step_times["reconstruction_s"] = round(time.perf_counter() - t_rec0, 4)
    _write_text(log_path, _read_text(log_path) + "[step] reconstruction/fitting done\n")
    update("running", 0.60, "reconstruction")

    # transform
    t_tr0 = time.perf_counter()
    await asyncio.sleep(0.3)
    step_times["transform_s"] = round(time.perf_counter() - t_tr0, 4)
    _write_text(log_path, _read_text(log_path) + "[step] transform done\n")
    update("running", 0.85, "transform")

    # 산출물 생성 (OBJ 2개: before/after)
    before_obj = artifacts_dir / "original.obj"
    after_obj = artifacts_dir / "child.obj"

    # 업로드한 파일이 OBJ면 before로 복사, 아니면 cube 생성
    input_meta = job.get("input", {})
    input_path = input_meta.get("savedPath")
    if input_path and Path(input_path).exists() and str(input_path).lower().endswith(".obj"):
        shutil.copy2(input_path, before_obj)
    else:
        _write_cube_obj(before_obj, scale=1.0)

    # after는 간단히 scale만 다르게
    _write_cube_obj(after_obj, scale=0.75)

    # 리포트(HTML/PDF + summary.json)
    report_html = reports_dir / "report.html"
    report_pdf = reports_dir / "report.pdf"
    summary_json = reports_dir / "summary.json"

    # HTML 리포트
    html = f"""<!doctype html>
<html>
<head><meta charset="utf-8"><title>KidMorph Report</title></head>
<body style="font-family: sans-serif;">
  <h2>KidMorph Studio Report</h2>
  <p><b>Job</b>: {job_id}</p>
  <p><b>Pipeline</b>: {job.get("pipelineType")}</p>
  <p><b>Preset</b>: {job.get("presetId")}</p>
  <p><b>Created</b>: {job.get("createdAt")}</p>
  <hr/>
  <h3>Artifacts</h3>
  <ul>
    <li>original.obj</li>
    <li>child.obj</li>
    <li>run.log</li>
    <li>summary.json</li>
  </ul>
  <p style="color:#666;">Generated by Team wongeon.</p>
</body>
</html>
"""
    _write_text(report_html, html)

    # summary.json (Reports 페이지에서 핵심 수치 표시용)
    runtime_s = round(time.perf_counter() - t0, 4)
    summary = {
        "job_id": job_id,
        "pipelineType": job.get("pipelineType"),
        "presetId": job.get("presetId"),
        "status": "done",
        "createdAt": job.get("createdAt"),
        "updatedAt": utc_now_iso(),
        "runtime_s": runtime_s,
        "steps": step_times,
        # 데모용 수치 (나중에 실제 변환 결과로 교체)
        "metrics": {
            "height_ratio": 0.78,
            "upper_leg_cm_delta": -8.1,
            "lower_leg_cm_delta": -7.6,
            "arm_cm_delta": -12.2,
        },
        "outputs": {
            "original_obj": "artifacts/original.obj",
            "child_obj": "artifacts/child.obj",
            "log": "logs/run.log",
            "report_html": "reports/report.html",
            "report_pdf": "reports/report.pdf",
            "summary_json": "reports/summary.json",
        },
        "notes": "Generated by KidMorph Backend v1 (mock).",
    }
    _write_text(summary_json, json.dumps(summary, ensure_ascii=False, indent=2))

    # ✅ PDF 리포트(진짜 PDF 생성)
    pdf_lines = [
        f"Job: {job_id}",
        f"Pipeline: {job.get('pipelineType')}",
        f"Preset: {job.get('presetId')}",
        f"Created: {job.get('createdAt')}",
        "",
        f"Runtime: {runtime_s}s",
        f"Steps: {step_times}",
        "",
        "Artifacts:",
        " - artifacts/original.obj",
        " - artifacts/child.obj",
        " - logs/run.log",
        " - reports/summary.json",
        "",
        "Generated by Team wongeon.",
    ]
    _write_pdf(report_pdf, title="KidMorph Studio Report", lines=pdf_lines)

    # artifacts 목록 업데이트 (최종)
    st = _load_state()
    j = _get_job_or_404(st, job_id)

    j["artifacts"] = [
        {"id": "a_original_obj", "kind": "model", "label": "original.obj", "url": _rel_to_files_url(before_obj)},
        {"id": "a_child_obj", "kind": "model", "label": "child.obj", "url": _rel_to_files_url(after_obj)},
        {"id": "a_log", "kind": "text", "label": "run.log", "url": _rel_to_files_url(log_path)},
        {"id": "a_report_html", "kind": "report", "label": "report.html", "url": _rel_to_files_url(report_html)},
        {"id": "a_report_pdf", "kind": "report", "label": "report.pdf", "url": _rel_to_files_url(report_pdf)},
        {"id": "a_summary_json", "kind": "report", "label": "summary.json", "url": _rel_to_files_url(summary_json)},
    ]
    j["updatedAt"] = utc_now_iso()
    j["message"] = "done"
    j["status"] = "done"
    j["progress"] = 1.0
    _save_state(st)


# =========================
# FastAPI app
# =========================
app = FastAPI(title="KidMorph Backend v1")

# CORS: Vite dev + localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.0.28:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 파일 서빙
_ensure_dirs()
app.mount(FILES_MOUNT_PATH, StaticFiles(directory=str(DATA_DIR), html=False), name="files")


@app.get("/health")
def health():
    return {"ok": True, "time": utc_now_iso()}


@app.get("/api/jobs")
def list_jobs(status: Optional[str] = None):
    st = _load_state()
    jobs = list(st.get("jobs", {}).values())
    jobs.sort(key=lambda x: x.get("createdAt", ""), reverse=True)

    if status:
        jobs = [j for j in jobs if j.get("status") == status]

    return {"items": jobs}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    st = _load_state()
    job = _get_job_or_404(st, job_id)
    return job

@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    st = _load_state()
    _get_job_or_404(st, job_id)  # 존재 확인

    # state에서 제거
    st["jobs"].pop(job_id, None)
    _save_state(st)

    # 디스크 폴더 제거
    job_root = _job_root(job_id)
    try:
        if job_root.exists():
            shutil.rmtree(job_root)
    except Exception:
        # 파일 삭제 실패해도 state는 삭제됨 (v1: best-effort)
        pass

    return {"ok": True, "id": job_id}


@app.post("/api/jobs")
async def create_job(
    background_tasks: BackgroundTasks,
    title: Optional[str] = Form(None),
    pipelineType: str = Form(...),
    presetId: str = Form(...),
    sampleId: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if pipelineType not in ALLOWED_PIPELINES:
        raise HTTPException(status_code=400, detail="invalid_pipelineType")
    if presetId not in ALLOWED_PRESETS:
        raise HTTPException(status_code=400, detail="invalid_presetId")

    job_id = f"job_{uuid.uuid4().hex[:8]}"
    created = utc_now_iso()

    job_root = _job_root(job_id)
    inputs_dir = job_root / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    input_meta: Dict[str, Any]
    if file is not None:
        safe = _safe_filename(file.filename or "upload.bin")
        saved_path = inputs_dir / safe
        content = await file.read()
        saved_path.write_bytes(content)
        input_meta = {
            "filename": safe,
            "contentType": file.content_type,
            "savedPath": str(saved_path),
            "bytes": len(content),
        }
    else:
        # sample 모드(파일 없이)
        input_meta = {"filename": None, "contentType": None, "savedPath": None, "bytes": 0}

    job = {
        "id": job_id,
        "title": (title or "").strip() or f"{pipelineType}",
        "pipelineType": pipelineType,
        "presetId": presetId,
        "sampleId": sampleId,
        "status": "queued",
        "progress": 0.0,
        "message": "queued",
        "createdAt": created,
        "updatedAt": created,
        "input": input_meta,
        "artifacts": [],
    }

    st = _load_state()
    st.setdefault("jobs", {})[job_id] = job
    _save_state(st)

    # 백그라운드 처리(데모)
    background_tasks.add_task(_run_async_job, job_id)

    return job

@app.get("/api/config")
def get_config():
    return {
        "ok": True,
        "time": utc_now_iso(),
        "dataDir": str(DATA_DIR),
        "allowedPipelines": sorted(list(ALLOWED_PIPELINES)),
        "allowedPresets": sorted(list(ALLOWED_PRESETS)),
        "filesMountPath": FILES_MOUNT_PATH,
        "version": "v1",
    }

async def _run_async_job(job_id: str):
    await _mock_process_job(job_id)