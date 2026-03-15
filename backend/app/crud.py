# backend/app/crud.py
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Optional, Dict, List

from sqlalchemy.orm import Session
from sqlalchemy import select, update, text
from sqlalchemy.exc import OperationalError, IntegrityError

from . import models


def now() -> datetime:
    return datetime.utcnow()


def _iso(dt: datetime | None) -> str:
    # legacy rows might have NULL timestamps
    if not dt:
        return now().isoformat()
    return dt.isoformat()


def _fetch_artifacts_map(db: Session, job_ids: List[str]) -> Dict[str, List[models.Artifact]]:
    if not job_ids:
        return {}
    rows = db.query(models.Artifact).filter(models.Artifact.job_id.in_(job_ids)).all()
    m: Dict[str, List[models.Artifact]] = {jid: [] for jid in job_ids}
    for r in rows:
        m.setdefault(r.job_id, []).append(r)
    return m


def job_to_dict(job: models.Job, artifacts: List[models.Artifact] | None = None) -> dict:
    arts = artifacts or []
    return {
        "id": job.id,
        "title": (job.title or ""),
        "pipelineType": (job.pipeline_type or ""),
        "presetId": (job.preset_id or ""),
        "status": (job.status or "unknown"),
        "progress": float(job.progress or 0.0),
        "message": (job.message or ""),
        "error": job.error,
        "createdAt": _iso(job.created_at),
        "updatedAt": _iso(job.updated_at),
        "input": {
            "filename": job.input_filename,
            "contentType": job.input_content_type,
            "savedPath": job.input_saved_path,
            "bytes": int(job.input_bytes or 0),
        },
        "artifacts": [{"id": a.id, "kind": a.kind, "label": a.label, "url": a.url} for a in arts],
    }


def list_jobs(db: Session, status: Optional[str] = None) -> list[dict]:
    q = db.query(models.Job)
    if status:
        q = q.filter(models.Job.status == status)
    q = q.order_by(models.Job.created_at.desc())
    jobs = q.all()

    ids = [j.id for j in jobs]
    art_map = _fetch_artifacts_map(db, ids)

    return [job_to_dict(j, art_map.get(j.id, [])) for j in jobs]


def get_job(db: Session, job_id: str) -> Optional[dict]:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        return None
    arts = db.query(models.Artifact).filter(models.Artifact.job_id == job_id).all()
    return job_to_dict(job, arts)


def create_job(
    db: Session,
    job_id: str,
    title: str,
    pipeline_type: str,
    preset_id: str,
    input_filename: str | None,
    input_content_type: str | None,
    input_saved_path: str | None,
    input_bytes: int,
) -> dict:
    job = models.Job(
        id=job_id,
        title=title,
        pipeline_type=pipeline_type,
        preset_id=preset_id,
        status="queued",
        progress=0.0,
        message="queued",
        error=None,
        input_filename=input_filename,
        input_content_type=input_content_type,
        input_saved_path=input_saved_path,
        input_bytes=int(input_bytes or 0),
        created_at=now(),
        updated_at=now(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job_to_dict(job, [])


def update_job_state(
    db: Session,
    job_id: str,
    status: str,
    progress: float,
    message: str,
    error: str | None = None,
) -> None:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        return
    job.status = status
    job.progress = float(progress)
    job.message = message
    job.updated_at = now()
    if error is not None:
        job.error = error
    db.commit()


def add_event(db: Session, job_id: str, level: str, code: str, payload: dict | None = None) -> None:
    """Append a job event.

    We prefer the current schema (level/code/payload/created_at). For legacy DB volumes
    that still use ts/status/progress/message/detail_json, we fall back to a compatible
    INSERT so the worker never crashes while trying to report an error.
    """
    try:
        ev = models.JobEvent(
            job_id=job_id,
            level=level,
            code=code,
            payload=payload,
            created_at=now(),
        )
        db.add(ev)
        db.commit()
        return
    except OperationalError:
        db.rollback()

    # Legacy fallback (best-effort)
    try:
        db.execute(
            text(
                """
                INSERT INTO job_events (job_id, ts, status, progress, message, detail_json)
                VALUES (:job_id, NOW(6), NULL, NULL, :message, :detail_json)
                """
            ),
            {
                "job_id": job_id,
                "message": code,
                "detail_json": json.dumps(payload or {}, ensure_ascii=False),
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        raise


def _artifact_id(job_id: str, kind: str, label: str) -> str:
    """
    artifacts.id는 테이블 전체에서 PRIMARY KEY.
    기존처럼 a_original_obj 같은 고정값을 쓰면 job이 달라져도 충돌함.

    => job_id + kind + label 기반으로 전역 유니크하게 생성.
    """
    safe_label = re.sub(r"[^a-zA-Z0-9]+", "_", (label or "").strip()).strip("_").lower()
    if not safe_label:
        safe_label = "artifact"
    safe_kind = re.sub(r"[^a-zA-Z0-9]+", "_", (kind or "").strip()).strip("_").lower() or "file"
    return f"a_{job_id}_{safe_kind}_{safe_label}"


def upsert_artifacts(db: Session, job_id: str, artifacts: list[dict]) -> None:
    """
    안전한 upsert:
    - 같은 job 재실행 시 중복 누적 방지: 해당 job_id의 artifacts를 먼저 삭제 후 재삽입
    - artifacts.id 충돌 방지: id를 job_id+kind+label로 새로 생성
    """
    try:
        # 같은 job을 여러 번 돌릴 때 기존 artifacts를 정리
        db.query(models.Artifact).filter(models.Artifact.job_id == job_id).delete(synchronize_session=False)
        db.flush()

        for a in artifacts:
            kind = a.get("kind") or "file"
            label = a.get("label") or ""
            url = a.get("url") or ""
            db.add(
                models.Artifact(
                    id=_artifact_id(job_id, kind, label),
                    job_id=job_id,
                    kind=kind,
                    label=label,
                    url=url,
                )
            )

        db.commit()
    except IntegrityError:
        # flush/commit 실패 후엔 반드시 rollback 해야 PendingRollbackError가 안 남음
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


def delete_job(db: Session, job_id: str) -> bool:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        return False

    # best-effort: delete children first (in case FK/cascade isn't set in DB)
    db.query(models.Artifact).filter(models.Artifact.job_id == job_id).delete(synchronize_session=False)
    db.query(models.JobEvent).filter(models.JobEvent.job_id == job_id).delete(synchronize_session=False)

    db.delete(job)
    db.commit()
    return True


def claim_next_job(db: Session) -> Optional[str]:
    """
    Claim 1 queued job safely.
    - Uses SELECT ... FOR UPDATE to reduce double-claims (needs InnoDB).
    """
    try:
        db.begin()
        row = (
            db.execute(
                select(models.Job.id)
                .where(models.Job.status == "queued")
                .order_by(models.Job.created_at.asc())
                .limit(1)
                .with_for_update()
            )
            .first()
        )

        if not row:
            db.commit()
            return None

        job_id = row[0]
        db.execute(
            update(models.Job)
            .where(models.Job.id == job_id)
            .values(status="running", progress=0.01, message="claimed", updated_at=now())
        )
        db.commit()
        return job_id
    except OperationalError:
        db.rollback()
        return None
    except Exception:
        db.rollback()
        raise