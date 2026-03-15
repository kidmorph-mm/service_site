from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
import smplx
import trimesh

from . import kidify_smplx_batch as K


# -----------------------------------------------------------------------------
# Small logging helper
# -----------------------------------------------------------------------------
def _log(msg: str) -> None:
    print(msg, flush=True)


# -----------------------------------------------------------------------------
# Path / env helpers
# -----------------------------------------------------------------------------

def require_path(path: str, name: str) -> str:
    p = (path or "").strip()
    if not p:
        raise RuntimeError(f"Missing {name} (env).")
    if not Path(p).exists():
        raise RuntimeError(f"{name} not found: {p}")
    return p



def _normalize_smplx_model_root(model_root: str) -> str:
    """
    smplx.create(model_root, model_type='smplx') expects model_root/<model_type> to exist.
    Users sometimes pass .../smplx instead of the parent. Normalize both cases.
    """
    p = Path(model_root)
    if (p / "smplx").exists():
        return str(p)
    if p.name.lower() == "smplx" and p.exists() and (p.parent / "smplx").exists():
        return str(p.parent)
    return str(p)



def pick_device() -> str:
    forced = os.environ.get("KIDMORPH_DEVICE", "").strip().lower()
    if forced in ("cpu", "cuda"):
        if forced == "cuda" and not torch.cuda.is_available():
            return "cpu"
        return forced
    return "cuda" if torch.cuda.is_available() else "cpu"



def _get_npz_index() -> int:
    raw = os.environ.get("KIDMORPH_NPZ_INDEX", "0").strip()
    try:
        idx = int(raw)
    except Exception:
        idx = 0
    return max(idx, 0)



def _ensure_supported_input(in_path: Path) -> Path:
    ext = in_path.suffix.lower()
    if ext in (".pkl", ".npz"):
        return in_path
    raise RuntimeError(f"invalid_input_ext: {ext}")


# -----------------------------------------------------------------------------
# Config loaders
# -----------------------------------------------------------------------------

def _load_best_and_heights() -> tuple[K.TemplateMorphParams, Dict[str, float], np.ndarray]:
    kid_audit = require_path(os.environ.get("KIDMORPH_KID_AUDIT_CSV", ""), "KIDMORPH_KID_AUDIT_CSV")
    best_txt = require_path(os.environ.get("KIDMORPH_BEST_PARAMS_TXT", ""), "KIDMORPH_BEST_PARAMS_TXT")

    best_mid, small_d = K.load_best_params_txt(best_txt)
    kid_heights = K.load_kid_heights(kid_audit)
    return best_mid, small_d, kid_heights


# -----------------------------------------------------------------------------
# Normalized input loader
# -----------------------------------------------------------------------------

def _load_normalized_input(in_path: Path) -> dict:
    """
    Load input through kidify_smplx_batch's own loader.

    This is the key compatibility fix:
    - .pkl is read as before
    - .npz is NOT converted to a temporary pickle
    - .npz goes through K.load_pkl(..., npz_index=...), which internally normalizes
      pred_shape / pred_pose / pred_cam_t -> betas / global_orient / body_pose / transl
    """
    in_path = _ensure_supported_input(Path(in_path))
    npz_index = _get_npz_index()
    data = K.load_pkl(str(in_path), npz_index=npz_index)
    return data



def _arr_from_normalized(data: dict, key: str, dim: int) -> np.ndarray:
    """
    Convert a normalized field to shape (1, dim), trimming/padding as needed.
    Missing values become zeros.
    """
    v = data.get(key, None)
    if v is None:
        a = np.zeros((1, dim), dtype=np.float32)
    else:
        a = np.asarray(v, dtype=np.float32)
        if a.ndim == 1:
            a = a[None, :]
        if a.shape[-1] > dim:
            a = a[..., :dim]
        elif a.shape[-1] < dim:
            pad = np.zeros((a.shape[0], dim - a.shape[-1]), dtype=np.float32)
            a = np.concatenate([a, pad], axis=-1)
    return a.astype(np.float32, copy=False)



def _infer_num_betas_from_data(data: dict) -> int:
    betas_np = np.asarray(data.get("betas", np.zeros((1, 10), np.float32)), dtype=np.float32)
    if betas_np.ndim == 1:
        betas_np = betas_np[None, :]
    return int(betas_np.shape[-1])


# -----------------------------------------------------------------------------
# Export original adult OBJ
# -----------------------------------------------------------------------------

def export_adult_original_obj(model_root: str, in_path: Path, out_obj: Path, device: str) -> None:
    """
    Export the original/adult mesh.

    Important behavior:
    - For npz/pkl inputs that already contain posed vertices under `v`, use them directly.
      This preserves the original pose exactly and avoids accidental T-pose fallback.
    - Otherwise reconstruct from normalized SMPL-X parameters.
    """
    in_path = _ensure_supported_input(Path(in_path))
    out_obj = Path(out_obj)
    out_obj.parent.mkdir(parents=True, exist_ok=True)

    model_root = _normalize_smplx_model_root(model_root)
    data = _load_normalized_input(in_path)

    num_betas = _infer_num_betas_from_data(data)
    m = smplx.create(
        model_root,
        model_type="smplx",
        gender="neutral",
        use_pca=False,
        batch_size=1,
        num_betas=num_betas,
    ).to(device)
    m.eval()
    faces = np.asarray(m.faces)

    # Path 1: direct posed vertices if available.
    if "v" in data:
        try:
            v = np.asarray(data["v"], dtype=np.float32)
            if v.ndim == 3:
                v = v[0]
            if v.ndim == 2 and v.shape[1] == 3:
                mesh = trimesh.Trimesh(vertices=v, faces=faces, process=False)
                mesh.export(str(out_obj))
                _log(f"[DBG][service] exported adult original from direct vertices: {out_obj}")
                return
        except Exception as e:
            _log(f"[WARN][service] failed direct vertex export, falling back to SMPL-X params: {type(e).__name__}: {e}")

    # Path 2: reconstruct from normalized SMPL-X params.
    betas_np = np.asarray(data.get("betas", np.zeros((1, 10), np.float32)), dtype=np.float32)
    if betas_np.ndim == 1:
        betas_np = betas_np[None, :]

    out = m(
        betas=torch.tensor(betas_np, device=device),
        global_orient=torch.tensor(_arr_from_normalized(data, "global_orient", 3), device=device),
        body_pose=torch.tensor(_arr_from_normalized(data, "body_pose", 63), device=device),
        transl=torch.tensor(_arr_from_normalized(data, "transl", 3), device=device),
        left_hand_pose=torch.tensor(_arr_from_normalized(data, "left_hand_pose", 45), device=device),
        right_hand_pose=torch.tensor(_arr_from_normalized(data, "right_hand_pose", 45), device=device),
        jaw_pose=torch.tensor(_arr_from_normalized(data, "jaw_pose", 3), device=device),
        leye_pose=torch.tensor(_arr_from_normalized(data, "leye_pose", 3), device=device),
        reye_pose=torch.tensor(_arr_from_normalized(data, "reye_pose", 3), device=device),
        expression=torch.tensor(_arr_from_normalized(data, "expression", 10), device=device),
        return_verts=True,
    )

    verts = out.vertices[0].detach().cpu().numpy()
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    mesh.export(str(out_obj))
    _log(f"[DBG][service] exported adult original from normalized params: {out_obj}")


# -----------------------------------------------------------------------------
# Run single kidify job
# -----------------------------------------------------------------------------

def run_kidify_single(
    in_path: Path,
    out_dir: Path,
    out_prefix: str,
    seed: int,
) -> tuple[Path, Path, Dict[str, Any]]:
    """
    Directly call kidify_smplx_batch.convert_one_pkl for a single sample.
    Produces:
      - {out_prefix}_child.obj
      - {out_prefix}_meta.json

    Compatibility notes:
    - Keeps pkl behavior intact
    - For npz, passes the original .npz path directly into K.load_pkl / K.convert_one_pkl
      so kidify_smplx_batch's normalization logic is actually used.
    """
    model_root = require_path(os.environ.get("KIDMORPH_MODEL_ROOT", ""), "KIDMORPH_MODEL_ROOT")
    model_root = _normalize_smplx_model_root(model_root)

    device = pick_device()
    npz_index = _get_npz_index()

    # Keep kidify module on the same device as service runtime.
    K.DEVICE = device

    best_mid, small_d, kid_heights = _load_best_and_heights()

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    work_input = _ensure_supported_input(Path(in_path))

    # Infer num_betas from normalized input (works for both pkl and npz).
    s0 = K.load_pkl(str(work_input), npz_index=npz_index)
    bet0 = np.asarray(s0.get("betas", np.zeros((10,), np.float32)), dtype=np.float32)
    if bet0.ndim == 1:
        bet0 = bet0[None, :]
    num_betas = int(bet0.shape[-1])

    model_adult = smplx.create(
        model_root,
        model_type="smplx",
        gender="neutral",
        use_pca=False,
        batch_size=1,
        num_betas=num_betas,
    ).to(device)
    model_adult.eval()
    faces = np.asarray(getattr(model_adult, "faces"))

    _log(
        f"[DBG][service] run_kidify_single input={work_input} "
        f"ext={work_input.suffix.lower()} npz_index={npz_index} device={device}"
    )

    meta = K.convert_one_pkl(
        model_root=model_root,
        model_adult=model_adult,
        faces=faces,
        kid_heights=kid_heights,
        best_mid=best_mid,
        best_small_deltas=small_d,
        in_pkl_path=str(work_input),
        seed=int(seed),
        export_obj=True,
        export_ply=False,
        out_dir=str(out_dir),
        out_prefix=out_prefix,
        npz_index=npz_index,
    )

    child_obj = out_dir / f"{out_prefix}_child.obj"
    meta_json = out_dir / f"{out_prefix}_meta.json"
    if not child_obj.exists():
        raise RuntimeError(f"kidify output missing: {child_obj}")
    if not meta_json.exists():
        raise RuntimeError(f"kidify meta missing: {meta_json}")

    return child_obj, meta_json, meta
