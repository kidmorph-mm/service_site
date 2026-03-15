from __future__ import annotations

import os
import json
import time
import shutil
from pathlib import Path
from typing import Dict, Any, List

from app.db import SessionLocal, ensure_tables
from app import crud
from app.workers.service import pick_device, require_path, export_adult_original_obj, run_kidify_single

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

DATA_DIR = Path(os.environ.get("KIDMORPH_DATA_DIR", "/data/jobs")).resolve()
FILES_MOUNT_PATH = os.environ.get("KIDMORPH_FILES_MOUNT_PATH", "/files")

def job_root(job_id: str) -> Path:
    return (DATA_DIR / "jobs" / job_id).resolve()

def rel_to_files_url(path: Path) -> str:
    rel = path.resolve().relative_to(DATA_DIR)
    return f"{FILES_MOUNT_PATH}/{rel.as_posix()}"

def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""

def write_pdf(path: Path, title: str, lines: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=A4)
    _, height = A4
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

def move_or_copy(src: Path, dst: Path) -> None:
    src = Path(src); dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        if src.resolve() == dst.resolve():
            return
    except Exception:
        pass
    try:
        src.replace(dst)
        return
    except Exception:
        shutil.copy2(src, dst)
        try:
            src.unlink()
        except Exception:
            pass

def build_summary_from_kidify_meta(job: dict, meta: dict, runtime_s: float, step_times: dict) -> dict:
    adult_h = float(meta.get("adult_h_canonical", 0.0) or 0.0)
    child_h = float(meta.get("child_h_canonical_final", 0.0) or 0.0)
    height_ratio = (child_h / adult_h) if adult_h > 1e-8 else None

    ratios_a = meta.get("ratios_adult_canonical", {}) or {}
    ratios_c = meta.get("ratios_child_canonical_final", {}) or {}
    ratios_d = meta.get("ratios_delta(child-adult)", {}) or {}

    key_ratios = ["head_over_torso", "shoulder_over_torso", "leg_over_torso", "shoulder_over_leg", "arm_over_torso"]
    ratios = {
        "adult": {k: ratios_a.get(k) for k in key_ratios},
        "child": {k: ratios_c.get(k) for k in key_ratios},
        "delta": {k: ratios_d.get(k) for k in key_ratios},
    }

    return {
        "job_id": job["id"],
        "title": job.get("title"),
        "pipelineType": job.get("pipelineType"),
        "presetId": job.get("presetId"),
        "status": "done",
        "createdAt": job.get("createdAt"),
        "updatedAt": job.get("updatedAt"),
        "runtime_s": runtime_s,
        "steps": step_times,
        "metrics": {
            "adult_h_canonical": meta.get("adult_h_canonical"),
            "adult_h_posed": meta.get("adult_h_posed"),
            "target_kid_h": meta.get("target_kid_h"),
            "child_h_canonical_raw": meta.get("child_h_canonical_raw"),
            "child_h_canonical_final": meta.get("child_h_canonical_final"),
            "child_h_posed_final": meta.get("child_h_posed_final"),
            "scale_final": meta.get("scale_final"),
            "height_ratio": height_ratio,
            "w_small": meta.get("w_small"),
            "w_mid": meta.get("w_mid"),
            "w_peak": meta.get("w_peak"),
            "w_tall": meta.get("w_tall"),
        },
        "ratios": ratios,
        "notes": "Kidify summary (server).",
    }

def process_job(db: Session, job_id: str):
    job = crud.get_job(db, job_id)
    if not job:
        return

    root = job_root(job_id)
    inputs_dir = root / "inputs"
    artifacts_dir = root / "artifacts"
    reports_dir = root / "reports"
    logs_dir = root / "logs"
    tmp_root = root / "_tmp"
    for d in (inputs_dir, artifacts_dir, reports_dir, logs_dir, tmp_root):
        d.mkdir(parents=True, exist_ok=True)

    run_log = logs_dir / "run.log"
    write_text(run_log, "[start] worker processing\n")

    pipeline = job["pipelineType"]
    input_saved = job["input"].get("savedPath")

    # 공통 리소스 체크
    model_root = require_path(os.environ.get("KIDMORPH_MODEL_ROOT", ""), "KIDMORPH_MODEL_ROOT")
    require_path(os.environ.get("KIDMORPH_KID_AUDIT_CSV", ""), "KIDMORPH_KID_AUDIT_CSV")
    require_path(os.environ.get("KIDMORPH_BEST_PARAMS_TXT", ""), "KIDMORPH_BEST_PARAMS_TXT")

    t0 = time.perf_counter()
    step_times: Dict[str, float] = {}
    device = pick_device()

    try:
        if pipeline == "smplx_to_child":
            if not input_saved:
                raise RuntimeError("missing_input_file")
            in_path = Path(input_saved)
            if not in_path.exists():
                raise RuntimeError(f"file_not_found: {in_path}")

            crud.update_job_state(db, job_id, "running", 0.10, "prepare")
            write_text(run_log, read_text(run_log) + f"[info] device={device}\n")

            # 1) original.obj
            t1 = time.perf_counter()
            crud.update_job_state(db, job_id, "running", 0.25, "export_original")
            original_obj = artifacts_dir / "original.obj"
            export_adult_original_obj(model_root, in_path, original_obj, device)
            step_times["export_original_s"] = round(time.perf_counter() - t1, 4)
            write_text(run_log, read_text(run_log) + "[step] export_original done\n")

            # 2) kidify는 tmp에 생성 (SameFileError 근본 방지)
            t2 = time.perf_counter()
            crud.update_job_state(db, job_id, "running", 0.70, "kidify")
            seed_base = int(os.environ.get("KIDMORPH_SEED", "42"))
            seed = seed_base + int(job_id[-2:], 16)
            kidify_out = tmp_root / "kidify_out"
            child_tmp, meta_tmp, meta = run_kidify_single(in_path, kidify_out, "kidify", seed)
            step_times["kidify_s"] = round(time.perf_counter() - t2, 4)
            write_text(run_log, read_text(run_log) + "[step] kidify done\n")

            # 3) artifacts로 정리
            crud.update_job_state(db, job_id, "running", 0.90, "finalize")
            child_obj = artifacts_dir / "child.obj"
            kidify_meta = artifacts_dir / "kidify_meta.json"
            move_or_copy(child_tmp, child_obj)
            move_or_copy(meta_tmp, kidify_meta)

            # 4) summary/report
            runtime_s = round(time.perf_counter() - t0, 4)
            # 최신 job 다시 읽기
            job = crud.get_job(db, job_id) or job
            summary = build_summary_from_kidify_meta(job, meta, runtime_s, step_times)

            summary_json = reports_dir / "summary.json"
            write_text(summary_json, json.dumps(summary, ensure_ascii=False, indent=2))

            report_html = reports_dir / "report.html"
            write_text(report_html, "<html><body><h3>KidMorph Report</h3></body></html>")

            report_pdf = reports_dir / "report.pdf"
            write_pdf(report_pdf, "KidMorph Studio Report", [
                f"Job: {job_id}",
                f"Title: {job.get('title')}",
                f"Pipeline: {pipeline}",
                f"Runtime: {runtime_s}s",
            ])

            # 5) DB artifacts upsert
            artifacts = [
                {"id": "a_original_obj", "kind": "model", "label": "original.obj", "url": rel_to_files_url(original_obj)},
                {"id": "a_child_obj", "kind": "model", "label": "child.obj", "url": rel_to_files_url(child_obj)},
                {"id": "a_kidify_meta", "kind": "report", "label": "kidify_meta.json", "url": rel_to_files_url(kidify_meta)},
                {"id": "a_log", "kind": "text", "label": "run.log", "url": rel_to_files_url(run_log)},
                {"id": "a_summary_json", "kind": "report", "label": "summary.json", "url": rel_to_files_url(summary_json)},
                {"id": "a_report_html", "kind": "report", "label": "report.html", "url": rel_to_files_url(report_html)},
                {"id": "a_report_pdf", "kind": "report", "label": "report.pdf", "url": rel_to_files_url(report_pdf)},
            ]
            crud.upsert_artifacts(db, job_id, artifacts)
            crud.update_job_state(db, job_id, "done", 1.0, "done")
            crud.add_event(db, job_id, "info", "job_done", {"runtime_s": runtime_s})
            write_text(run_log, read_text(run_log) + "[done]\n")

            # tmp 정리
            try:
                shutil.rmtree(tmp_root, ignore_errors=True)
            except Exception:
                pass

        else:
            # image_to_child는 일단 mock (원하면 여기에도 실제 파이프라인 붙이면 됨)
            crud.update_job_state(db, job_id, "running", 0.5, "mock")
            time.sleep(0.2)
            crud.update_job_state(db, job_id, "done", 1.0, "done")

    except Exception as e:
        crud.update_job_state(db, job_id, "failed", 1.0, "failed", error=f"{type(e).__name__}: {e}")
        crud.add_event(db, job_id, "error", "job_failed", {"error": str(e)})
        write_text(run_log, read_text(run_log) + f"\n[error] {type(e).__name__}: {e}\n")
        raise

def main():
    # Make sure schema exists even if worker starts before backend
    ensure_tables()
    poll_ms = int(os.environ.get("KIDMORPH_WORKER_POLL_MS", "1000"))
    while True:
        db = SessionLocal()
        try:
            job_id = crud.claim_next_job(db)
            if not job_id:
                time.sleep(poll_ms / 1000.0)
                continue
            process_job(db, job_id)
        finally:
            db.close()

if __name__ == "__main__":
    main()