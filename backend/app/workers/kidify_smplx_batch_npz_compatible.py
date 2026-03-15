
# kidify_smplx_batch.py
# SMPL-X adult pkl/npz -> kidified posed mesh exporter using best params
# - Reads best params txt (head/shoulder/leg/torso/arm + small deltas)
# - Height-adaptive template blending (small/mid/peak/tall + optional mid-peak)
# - Pose-preserving: exports posed OBJ/PLY
# - Logs: original height (canonical/posed), target height, child height (canonical raw/final, posed final)
# - Logs: what changed (segment lengths + ratios + deltas) in JSON + CSV
# - Function names kept for server compatibility: load_pkl, convert_one_pkl
#
# Requirements:
#   pip install smplx torch numpy pandas trimesh
#
# Example:
#   python kidify_smplx_batch.py ^
#     --model_root "C:\Users\wonseo\Desktop\agora dataset\models" ^
#     --kid_audit_csv "C:\Users\wonseo\Desktop\agora dataset\data\kid_scale_audit.csv" ^
#     --best_params_txt "D:\kid_trans_data_all\final_best_params_after_arm_micro_sweep.txt" ^
#     --in_list "D:\kid_trans_data_all\adult_list.txt" ^
#     --out_dir "D:\kid_trans_data_all\server_export" ^
#     --export_obj 1 --export_ply 0 --seed 42 --n_max 0
#
# adult_list.txt: one pkl/npz path per line

import os
import re
import csv
import json
import argparse
import pickle
from dataclasses import dataclass, replace
from typing import Dict, Tuple, Optional, List

import numpy as np
import pandas as pd
import torch
import smplx
import trimesh


# =========================
# Defaults (override via CLI)
# =========================
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# target kid height sampling config
TRIM_Q = (0.25, 0.95)
TARGET_RANGE = (1.05, 1.45)
DOWNSCALE_MARGIN = 0.98

# betas residue suppression (same as your pipeline)
BETAS_MIX = 0.60
BETAS0_OFFSET = -0.5
BETAS1_OFFSET = 0.2

# canonical switches (used for height computation & scaling anchor)
USE_JOINTS_FROM_V = True
USE_CANONICAL_FOR_HEIGHT = True

# height-adaptive template blending (typical)
USE_HEIGHT_ADAPTIVE_TEMPLATE = True
USE_MID_PEAK_TEMPLATE = True
H_BLEND_SMALL = 1.15
H_BLEND_MID = 1.27
H_BLEND_TALL = 1.40
H_PEAK = 1.27
PEAK_WIDTH = 0.04
PEAK_MAX_WEIGHT = 0.35

# SMPL-X joint indices (must match your regressor ordering)
J = {
    "l_hip": 1,
    "r_hip": 2,
    "l_knee": 4,
    "r_knee": 5,
    "l_ankle": 7,
    "r_ankle": 8,
    "neck": 12,
    "head": 15,
    "l_shoulder": 16,
    "r_shoulder": 17,
    "l_elbow": 18,
    "r_elbow": 19,
    "l_wrist": 20,
    "r_wrist": 21,
}


# =========================
# Params
# =========================
@dataclass
class TemplateMorphParams:
    head_scale: float = 1.06
    shoulder_scale: float = 1.02
    leg_y_scale: float = 1.08
    torso_y_scale: float = 0.88

    # arm length morph
    arm_len_scale: float = 0.96          # <1 => shorten
    arm_sigma_out: float = 0.03          # gate sigma (height fraction)
    arm_radius: float = 0.30             # radius around arm axis (height fraction)
    arm_out_offset: float = 0.02         # gate offset (height fraction)

    # hand-preserving options
    hand_keep_radius: float = 0.10       # wrist 주변 rigid protection radius (height fraction)
    hand_after_sigma: float = 0.02       # wrist 이후 영역 분리용 sigma

    # head morph
    head_y_offset: float = 0.04
    head_sigma_y: float = 0.02
    head_radius: float = 0.12

    # torso/shoulder/leg gating
    torso_sigma_y: float = 0.04
    shoulder_radius: float = 0.24
    leg_sigma_y: float = 0.06


def clamp_params(tp: TemplateMorphParams) -> TemplateMorphParams:
    tp.head_scale = float(np.clip(tp.head_scale, 1.00, 1.18))
    tp.shoulder_scale = float(np.clip(tp.shoulder_scale, 0.85, 1.20))
    tp.leg_y_scale = float(np.clip(tp.leg_y_scale, 0.90, 1.25))
    tp.torso_y_scale = float(np.clip(tp.torso_y_scale, 0.80, 1.05))

    tp.arm_len_scale = float(np.clip(tp.arm_len_scale, 0.80, 1.05))
    tp.arm_sigma_out = float(np.clip(tp.arm_sigma_out, 0.005, 0.10))
    tp.arm_radius = float(np.clip(tp.arm_radius, 0.10, 0.60))
    tp.arm_out_offset = float(np.clip(tp.arm_out_offset, 0.0, 0.10))

    tp.hand_keep_radius = float(np.clip(tp.hand_keep_radius, 0.03, 0.30))
    tp.hand_after_sigma = float(np.clip(tp.hand_after_sigma, 0.005, 0.08))
    return tp


def _apply_delta(tp: TemplateMorphParams, delta: Dict[str, float]) -> TemplateMorphParams:
    out = replace(tp)
    for k, dv in delta.items():
        if hasattr(out, k):
            setattr(out, k, float(getattr(out, k) + dv))
    return clamp_params(out)


# =========================
# IO helpers
# =========================
def _matrix_to_rotvec_np(rot_mats: np.ndarray) -> np.ndarray:
    """
    Pure numpy rotation-matrix -> axis-angle(rotvec) converter.
    Supports (..., 3, 3) input and returns (..., 3).
    """
    R = np.asarray(rot_mats, dtype=np.float64)
    if R.shape[-2:] != (3, 3):
        raise ValueError(f"Expected (...,3,3) rotation matrices, got {R.shape}")

    orig_shape = R.shape[:-2]
    R = R.reshape(-1, 3, 3)

    q = np.zeros((R.shape[0], 4), dtype=np.float64)  # [w, x, y, z]
    tr = R[:, 0, 0] + R[:, 1, 1] + R[:, 2, 2]

    mask = tr > 0.0
    if np.any(mask):
        S = np.sqrt(np.maximum(tr[mask] + 1.0, 1e-12)) * 2.0
        q[mask, 0] = 0.25 * S
        q[mask, 1] = (R[mask, 2, 1] - R[mask, 1, 2]) / S
        q[mask, 2] = (R[mask, 0, 2] - R[mask, 2, 0]) / S
        q[mask, 3] = (R[mask, 1, 0] - R[mask, 0, 1]) / S

    mask_x = (~mask) & (R[:, 0, 0] > R[:, 1, 1]) & (R[:, 0, 0] > R[:, 2, 2])
    if np.any(mask_x):
        S = np.sqrt(np.maximum(1.0 + R[mask_x, 0, 0] - R[mask_x, 1, 1] - R[mask_x, 2, 2], 1e-12)) * 2.0
        q[mask_x, 0] = (R[mask_x, 2, 1] - R[mask_x, 1, 2]) / S
        q[mask_x, 1] = 0.25 * S
        q[mask_x, 2] = (R[mask_x, 0, 1] + R[mask_x, 1, 0]) / S
        q[mask_x, 3] = (R[mask_x, 0, 2] + R[mask_x, 2, 0]) / S

    mask_y = (~mask) & (~mask_x) & (R[:, 1, 1] > R[:, 2, 2])
    if np.any(mask_y):
        S = np.sqrt(np.maximum(1.0 + R[mask_y, 1, 1] - R[mask_y, 0, 0] - R[mask_y, 2, 2], 1e-12)) * 2.0
        q[mask_y, 0] = (R[mask_y, 0, 2] - R[mask_y, 2, 0]) / S
        q[mask_y, 1] = (R[mask_y, 0, 1] + R[mask_y, 1, 0]) / S
        q[mask_y, 2] = 0.25 * S
        q[mask_y, 3] = (R[mask_y, 1, 2] + R[mask_y, 2, 1]) / S

    mask_z = (~mask) & (~mask_x) & (~mask_y)
    if np.any(mask_z):
        S = np.sqrt(np.maximum(1.0 + R[mask_z, 2, 2] - R[mask_z, 0, 0] - R[mask_z, 1, 1], 1e-12)) * 2.0
        q[mask_z, 0] = (R[mask_z, 1, 0] - R[mask_z, 0, 1]) / S
        q[mask_z, 1] = (R[mask_z, 0, 2] + R[mask_z, 2, 0]) / S
        q[mask_z, 2] = (R[mask_z, 1, 2] + R[mask_z, 2, 1]) / S
        q[mask_z, 3] = 0.25 * S

    q_norm = np.linalg.norm(q, axis=1, keepdims=True)
    q = q / np.clip(q_norm, 1e-12, None)

    # q and -q are same rotation -> keep w >= 0 for stable rotvec
    neg = q[:, 0] < 0.0
    if np.any(neg):
        q[neg] *= -1.0

    xyz = q[:, 1:]
    sin_half = np.linalg.norm(xyz, axis=1)
    cos_half = np.clip(q[:, 0], -1.0, 1.0)
    angle = 2.0 * np.arctan2(sin_half, cos_half)

    rotvec = np.zeros((R.shape[0], 3), dtype=np.float64)
    small = sin_half < 1e-8

    if np.any(~small):
        axis = xyz[~small] / sin_half[~small, None]
        rotvec[~small] = axis * angle[~small, None]

    if np.any(small):
        rotvec[small] = 2.0 * xyz[small]

    return rotvec.reshape(*orig_shape, 3).astype(np.float32)


def _normalize_loaded_dict(data: dict) -> dict:
    """
    Normalize pkl/npz payloads into the pkl-like keys expected by the pipeline.
    Only fills missing keys; existing keys are preserved.
    """
    out = dict(data)

    # 1) betas fallback
    if ("betas" not in out) or (out["betas"] is None):
        for alt in ["pred_shape", "shape", "shapes", "pred_betas", "shape_params"]:
            if alt in out and out[alt] is not None:
                b = np.asarray(out[alt], dtype=np.float32)
                if b.ndim == 0:
                    b = b.reshape(1, 1)
                elif b.ndim == 1:
                    b = b[None, :]
                else:
                    b = b.reshape(b.shape[0], -1)
                out["betas"] = b
                break

    # 2) pose fallback from rotation matrices (..., 22, 3, 3)
    need_global = ("global_orient" not in out) or (out["global_orient"] is None)
    need_body = ("body_pose" not in out) or (out["body_pose"] is None)

    if need_global or need_body:
        pose_mats = None
        for alt in ["pred_pose", "pose_mats", "pred_rotmat", "pred_rotmats"]:
            if alt in out and out[alt] is not None:
                pm = np.asarray(out[alt], dtype=np.float32)
                if pm.ndim == 3 and pm.shape[-2:] == (3, 3):
                    pm = pm[None, ...]
                if pm.ndim == 4 and pm.shape[-2:] == (3, 3):
                    pose_mats = pm
                    break

        if pose_mats is not None:
            pose_rv = _matrix_to_rotvec_np(pose_mats)  # (B, J, 3)
            if pose_rv.ndim == 2:
                pose_rv = pose_rv[None, ...]

            if need_global and pose_rv.shape[1] >= 1:
                out["global_orient"] = pose_rv[:, 0, :].astype(np.float32)

            if need_body:
                if pose_rv.shape[1] >= 22:
                    body_pose = pose_rv[:, 1:22, :].reshape(pose_rv.shape[0], 63)
                elif pose_rv.shape[1] > 1:
                    body_pose = pose_rv[:, 1:, :].reshape(pose_rv.shape[0], -1)
                else:
                    body_pose = np.zeros((1, 63), dtype=np.float32)
                out["body_pose"] = body_pose.astype(np.float32)

    # 3) pose fallback from axis-angle bundles if provided in npz-like form
    need_global = ("global_orient" not in out) or (out["global_orient"] is None)
    need_body = ("body_pose" not in out) or (out["body_pose"] is None)
    if need_global or need_body:
        for alt in ["pred_pose_aa", "pose_axis_angle", "pred_rotvec", "pred_pose_axis_angle"]:
            if alt in out and out[alt] is not None:
                aa = np.asarray(out[alt], dtype=np.float32)
                if aa.ndim == 1:
                    aa = aa[None, :]
                elif aa.ndim >= 2:
                    aa = aa.reshape(aa.shape[0], -1)

                if aa.shape[-1] >= 66:
                    if need_global:
                        out["global_orient"] = aa[:, 0:3].astype(np.float32)
                    if need_body:
                        out["body_pose"] = aa[:, 3:66].astype(np.float32)
                    break

    # 4) translation fallback
    if ("transl" not in out) or (out["transl"] is None):
        for alt in ["pred_cam_t", "cam_t", "camera_translation"]:
            if alt in out and out[alt] is not None:
                t = np.asarray(out[alt], dtype=np.float32)
                if t.ndim == 0:
                    t = t.reshape(1, 1)
                elif t.ndim == 1:
                    t = t[None, :]
                else:
                    t = t.reshape(t.shape[0], -1)
                out["transl"] = t
                break

    return out


def load_pkl(path: str) -> dict:
    """
    기존 함수명 유지.
    .pkl 뿐 아니라 .npz도 지원.
    npz는 pkl과 키 구조가 다를 수 있으므로 betas/global_orient/body_pose/transl을
    가능한 한 pkl 호환 형태로 정규화해서 반환.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".pkl":
        with open(path, "rb") as f:
            data = pickle.load(f, encoding="latin1")
        return _normalize_loaded_dict(data)

    if ext == ".npz":
        z = np.load(path, allow_pickle=True)
        out = {}
        for k in z.files:
            out[k] = z[k]
        return _normalize_loaded_dict(out)

    raise RuntimeError(f"Unsupported file extension: {ext} ({path})")


def save_json(path: str, obj: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def ensure_dir(p: str):
    os.makedirs(p, exist_ok=True)


def export_mesh(path: str, verts: np.ndarray, faces: np.ndarray):
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    mesh.export(path)


def to_torch(x) -> torch.Tensor:
    x = np.asarray(x)
    if x.ndim == 0:
        x = x.reshape(1, 1)
    if x.ndim == 1:
        x = x[None, :]
    return torch.tensor(x, dtype=torch.float32, device=DEVICE)


def fix_lastdim(t: torch.Tensor, dim: int, pad_value: float = 0.0) -> torch.Tensor:
    if t.shape[-1] == dim:
        return t
    if t.shape[-1] > dim:
        return t[..., :dim]
    pad = torch.full((t.shape[0], dim - t.shape[-1]), float(pad_value), device=t.device, dtype=t.dtype)
    return torch.cat([t, pad], dim=-1)


def get_tensor(data: dict, key: str, dim: int, default_zero: bool = True) -> torch.Tensor:
    if key in data and data[key] is not None:
        t = to_torch(data[key])
        t = fix_lastdim(t, dim)
        return t
    if not default_zero:
        raise KeyError(f"Missing key: {key}")
    return torch.zeros((1, dim), device=DEVICE, dtype=torch.float32)


def _as_1d_np(x):
    if x is None:
        return None
    a = np.asarray(x)
    if a.size == 0:
        return None
    return a.reshape(-1).astype(np.float32)


def _get_pose_bundle_from_data(data: dict) -> dict:
    """
    npz/pkl에서 pose bundle을 최대한 유연하게 읽는다.
    explicit key가 있으면 우선 사용하고,
    없으면 full_pose / poses / pose 등에서 분해한다.
    """
    out = {}

    explicit_keys = [
        "global_orient", "body_pose", "left_hand_pose", "right_hand_pose",
        "jaw_pose", "leye_pose", "reye_pose"
    ]
    if any(k in data for k in explicit_keys):
        out["global_orient"] = _as_1d_np(data.get("global_orient"))
        out["body_pose"] = _as_1d_np(data.get("body_pose"))
        out["left_hand_pose"] = _as_1d_np(data.get("left_hand_pose"))
        out["right_hand_pose"] = _as_1d_np(data.get("right_hand_pose"))
        out["jaw_pose"] = _as_1d_np(data.get("jaw_pose"))
        out["leye_pose"] = _as_1d_np(data.get("leye_pose"))
        out["reye_pose"] = _as_1d_np(data.get("reye_pose"))
        return out

    pose = None
    for k in ["full_pose", "full_poses", "poses", "pose"]:
        if k in data and data[k] is not None:
            pose = _as_1d_np(data[k])
            break

    if pose is None:
        return out

    L = int(pose.shape[0])

    # common SMPL-X layout A
    def split_A(p):
        return {
            "global_orient": p[0:3],
            "body_pose": p[3:66],
            "jaw_pose": p[66:69],
            "leye_pose": p[69:72],
            "reye_pose": p[72:75],
            "left_hand_pose": p[75:120],
            "right_hand_pose": p[120:165],
        }

    # alternative layout B
    def split_B(p):
        return {
            "global_orient": p[0:3],
            "body_pose": p[3:66],
            "left_hand_pose": p[66:111],
            "right_hand_pose": p[111:156],
            "jaw_pose": p[156:159],
            "leye_pose": p[159:162],
            "reye_pose": p[162:165],
        }

    if L >= 165:
        candA = split_A(pose[:165].copy())
        candB = split_B(pose[:165].copy())

        def eye_jaw_score(c):
            return float(
                np.mean(np.abs(c["jaw_pose"])) +
                np.mean(np.abs(c["leye_pose"])) +
                np.mean(np.abs(c["reye_pose"]))
            )

        return candA if eye_jaw_score(candA) <= eye_jaw_score(candB) else candB

    if L >= 72:
        out["global_orient"] = pose[0:3].copy()
        out["body_pose"] = pose[3:66].copy()
        return out

    return out


# =========================
# SMPL-X joint regression
# =========================
def _to_torch_sparse_from_scipy(coo, device):
    import numpy as _np
    import torch as _torch
    coo = coo.tocoo()
    indices = _np.vstack((coo.row, coo.col)).astype(_np.int64)
    i = _torch.from_numpy(indices)
    v = _torch.from_numpy(coo.data.astype(_np.float32))
    sp = _torch.sparse_coo_tensor(i, v, size=coo.shape, device=device)
    return sp.coalesce()


def regress_joints_from_verts(model, verts_t: torch.Tensor) -> torch.Tensor:
    J_reg = getattr(model, "J_regressor", None)
    if J_reg is None:
        J_reg = getattr(model, "joint_regressor", None)
    if J_reg is None:
        raise RuntimeError("Model has no J_regressor/joint_regressor")

    if hasattr(J_reg, "tocoo") and (not torch.is_tensor(J_reg)):
        J_reg = _to_torch_sparse_from_scipy(J_reg, verts_t.device)

    if isinstance(J_reg, np.ndarray):
        J_reg = torch.tensor(J_reg, dtype=torch.float32)

    if not torch.is_tensor(J_reg):
        raise RuntimeError(f"Unexpected J_reg type: {type(J_reg)}")

    if J_reg.device != verts_t.device:
        J_reg = J_reg.to(verts_t.device)

    if verts_t.dim() == 3:
        verts_t = verts_t[0]  # (V,3)

    if J_reg.is_sparse:
        j = torch.sparse.mm(J_reg, verts_t)
    else:
        j = J_reg @ verts_t
    return j


def pelvis_from_joints(j_t: torch.Tensor) -> torch.Tensor:
    return 0.5 * (j_t[J["l_hip"]] + j_t[J["r_hip"]])


def bbox_height_y_t(v: torch.Tensor) -> torch.Tensor:
    y = v[:, 1]
    return (y.max() - y.min()).clamp_min(1e-8)


def sigmoid_t(x: torch.Tensor) -> torch.Tensor:
    return torch.sigmoid(torch.clamp(x, -60.0, 60.0))


@torch.no_grad()
def forward_canonical(model, betas: torch.Tensor, expression: Optional[torch.Tensor], return_verts: bool = True):
    zeros_3  = torch.zeros((1, 3),  device=DEVICE)
    zeros_63 = torch.zeros((1, 63), device=DEVICE)
    zeros_45 = torch.zeros((1, 45), device=DEVICE)
    zeros_10 = torch.zeros((1, 10), device=DEVICE)
    zeros_tr = torch.zeros((1, 3),  device=DEVICE)

    out = model(
        betas=betas,
        global_orient=zeros_3,
        body_pose=zeros_63,
        transl=zeros_tr,
        left_hand_pose=zeros_45,
        right_hand_pose=zeros_45,
        jaw_pose=zeros_3,
        leye_pose=zeros_3,
        reye_pose=zeros_3,
        expression=expression if expression is not None else zeros_10,
        return_verts=return_verts,
    )
    v = out.vertices[0]
    j = regress_joints_from_verts(model, v) if USE_JOINTS_FROM_V else out.joints[0]
    return v, j


# =========================
# Metrics: "어디가 어떻게 바뀌었는지" (lengths + ratios)
# =========================
def metrics_from_joints_np(j_np: np.ndarray) -> Dict[str, float]:
    if max(J.values()) >= len(j_np):
        raise RuntimeError(
            f"Joint array too small: len={len(j_np)} max(J)={max(J.values())}. Fix J mapping."
        )

    pelvis = 0.5 * (j_np[J["l_hip"]] + j_np[J["r_hip"]])
    neck = j_np[J["neck"]]
    head = j_np[J["head"]]
    ls = j_np[J["l_shoulder"]]
    rs = j_np[J["r_shoulder"]]

    l_hip, r_hip = j_np[J["l_hip"]], j_np[J["r_hip"]]
    l_knee, r_knee = j_np[J["l_knee"]], j_np[J["r_knee"]]
    l_ankle, r_ankle = j_np[J["l_ankle"]], j_np[J["r_ankle"]]

    shoulder_w = float(np.linalg.norm(ls - rs))
    head_len = float(np.linalg.norm(head - neck))
    torso_len = float(np.linalg.norm(neck - pelvis))

    leg_l = float(np.linalg.norm(l_hip - l_knee) + np.linalg.norm(l_knee - l_ankle))
    leg_r = float(np.linalg.norm(r_hip - r_knee) + np.linalg.norm(r_knee - r_ankle))
    leg_len = 0.5 * (leg_l + leg_r)

    le = j_np[J["l_elbow"]]
    re = j_np[J["r_elbow"]]
    lw = j_np[J["l_wrist"]]
    rw = j_np[J["r_wrist"]]
    arm_l = float(np.linalg.norm(ls - le) + np.linalg.norm(le - lw))
    arm_r = float(np.linalg.norm(rs - re) + np.linalg.norm(re - rw))
    arm_len = 0.5 * (arm_l + arm_r)

    return {
        "head_len": head_len,
        "torso_len": torso_len,
        "leg_len": leg_len,
        "arm_len": arm_len,
        "shoulder_w": shoulder_w,
    }


def ratios_from_metrics(m: Dict[str, float]) -> Dict[str, float]:
    eps = 1e-8
    return {
        "head_over_torso": float(m["head_len"] / max(m["torso_len"], eps)),
        "shoulder_over_torso": float(m["shoulder_w"] / max(m["torso_len"], eps)),
        "leg_over_torso": float(m["leg_len"] / max(m["torso_len"], eps)),
        "shoulder_over_leg": float(m["shoulder_w"] / max(m["leg_len"], eps)),
        "arm_over_torso": float(m["arm_len"] / max(m["torso_len"], eps)),
    }


def deltas_dict(a: Dict[str, float], b: Dict[str, float]) -> Dict[str, float]:
    keys = sorted(set(a.keys()) | set(b.keys()))
    out = {}
    for k in keys:
        va = a.get(k, float("nan"))
        vb = b.get(k, float("nan"))
        if (va is None) or (vb is None):
            out[k] = float("nan")
        else:
            out[k] = float(vb - va)
    return out


# =========================
# Height-adaptive weights
# =========================
def _height_weights(h: float) -> Tuple[float, float, float, float]:
    h = float(h)
    if not USE_HEIGHT_ADAPTIVE_TEMPLATE:
        return 0.0, 1.0, 0.0, 0.0

    if h <= H_BLEND_SMALL:
        w_small, w_mid, w_tall = 1.0, 0.0, 0.0
    elif h < H_BLEND_MID:
        t = (h - H_BLEND_SMALL) / max(H_BLEND_MID - H_BLEND_SMALL, 1e-8)
        w_small, w_mid, w_tall = float(1.0 - t), float(t), 0.0
    elif h < H_BLEND_TALL:
        t = (h - H_BLEND_MID) / max(H_BLEND_TALL - H_BLEND_MID, 1e-8)
        w_small, w_mid, w_tall = 0.0, float(1.0 - t), float(t)
    else:
        w_small, w_mid, w_tall = 0.0, 0.0, 1.0

    w_peak = 0.0
    if USE_MID_PEAK_TEMPLATE:
        z = (h - H_PEAK) / max(PEAK_WIDTH, 1e-8)
        bump = float(np.exp(-0.5 * z * z))
        w_peak = min(w_mid, bump * PEAK_MAX_WEIGHT)
        w_mid = max(w_mid - w_peak, 0.0)

    s = max(w_small + w_mid + w_peak + w_tall, 1e-8)
    return w_small/s, w_mid/s, w_peak/s, w_tall/s


def _blend_templates4(v_small, v_mid, v_peak, v_tall, w_small, w_mid, w_peak, w_tall) -> torch.Tensor:
    wsum = max(w_small + w_mid + w_peak + w_tall, 1e-8)
    w_small, w_mid, w_peak, w_tall = w_small/wsum, w_mid/wsum, w_peak/wsum, w_tall/wsum
    return (v_small * w_small) + (v_mid * w_mid) + (v_peak * w_peak) + (v_tall * w_tall)


def _set_model_template(model_child, v_template_new: torch.Tensor):
    if not hasattr(model_child, "v_template"):
        raise RuntimeError("model_child has no v_template")
    model_child.v_template.data.copy_(v_template_new)


# =========================
# Template morph (hand-preserving arm)
# =========================
@torch.no_grad()
def build_child_template(model, params: TemplateMorphParams) -> torch.Tensor:
    params = clamp_params(params)

    num_betas = model.num_betas
    betas0 = torch.zeros((1, num_betas), device=DEVICE)
    zeros_3 = torch.zeros((1, 3), device=DEVICE)
    zeros_63 = torch.zeros((1, 63), device=DEVICE)
    zeros_45 = torch.zeros((1, 45), device=DEVICE)
    zeros_10 = torch.zeros((1, 10), device=DEVICE)

    out = model(
        betas=betas0,
        global_orient=zeros_3,
        body_pose=zeros_63,
        left_hand_pose=zeros_45,
        right_hand_pose=zeros_45,
        jaw_pose=zeros_3,
        leye_pose=zeros_3,
        reye_pose=zeros_3,
        expression=zeros_10,
        return_verts=True,
    )
    v0 = out.vertices[0]
    j0 = regress_joints_from_verts(model, v0) if USE_JOINTS_FROM_V else out.joints[0]
    h = bbox_height_y_t(v0)

    pelvis = 0.5 * (j0[J["l_hip"]] + j0[J["r_hip"]])
    neck   = j0[J["neck"]]
    head   = j0[J["head"]]
    ls     = j0[J["l_shoulder"]]
    rs     = j0[J["r_shoulder"]]
    lw     = j0[J["l_wrist"]]
    rw     = j0[J["r_wrist"]]
    chest  = 0.5 * (ls + rs)

    head_sigma  = params.head_sigma_y * h
    head_r      = params.head_radius * h
    torso_sigma = params.torso_sigma_y * h
    sh_r        = params.shoulder_radius * h
    leg_sigma   = params.leg_sigma_y * h

    v = v0.clone()

    # (1) head enlarge
    y = v[:, 1]
    y_gate_start = neck[1] + params.head_y_offset * h
    w_head_y = sigmoid_t((y - y_gate_start) / head_sigma)
    d_head = torch.linalg.norm(v - head[None, :], dim=1)
    w_head_r = torch.exp(-(d_head * d_head) / (2.0 * (head_r * head_r)))
    w_head = w_head_y * w_head_r
    s_head = 1.0 + (params.head_scale - 1.0) * w_head
    v = neck[None, :] + (v - neck[None, :]) * s_head[:, None]

    # torso gate
    y = v[:, 1]
    w_torso = sigmoid_t((y - pelvis[1]) / torso_sigma) * sigmoid_t((neck[1] - y) / torso_sigma)

    # (2) shoulder x scale
    d_ls = torch.linalg.norm(v - ls[None, :], dim=1)
    d_rs = torch.linalg.norm(v - rs[None, :], dim=1)
    w_sh = torch.maximum(
        torch.exp(-(d_ls * d_ls) / (2.0 * (sh_r * sh_r))),
        torch.exp(-(d_rs * d_rs) / (2.0 * (sh_r * sh_r))),
    ) * w_torso
    s_sh = 1.0 + (params.shoulder_scale - 1.0) * w_sh
    v[:, 0] = chest[0] + (v[:, 0] - chest[0]) * s_sh

    # (2.5) arm length morph along shoulder->wrist axis
    # wrist 이전: scale
    # wrist 이후(hand/fingers): rigid translation only
    arm_sigma = params.arm_sigma_out * h
    arm_r = params.arm_radius * h
    arm_off = params.arm_out_offset * h
    hand_keep_r = params.hand_keep_radius * h
    hand_after_sigma = params.hand_after_sigma * h
    scale = float(params.arm_len_scale)

    def _apply_arm(shoulder: torch.Tensor, wrist: torch.Tensor):
        nonlocal v

        axis = wrist - shoulder
        axis_len = torch.linalg.norm(axis).clamp_min(1e-8)
        u = axis / axis_len
        arm_len = axis_len

        d = v - shoulder[None, :]
        t = (d * u[None, :]).sum(dim=1)

        # distance to arm segment [0, arm_len]
        t_clamped = torch.clamp(t, 0.0, float(arm_len.item()))
        d_perp = torch.linalg.norm(d - t_clamped[:, None] * u[None, :], dim=1)

        # arm region mask
        w_out = sigmoid_t((t - arm_off) / max(arm_sigma, 1e-8))
        w_arm_axis = torch.exp(-(d_perp * d_perp) / (2.0 * max(arm_r * arm_r, 1e-12)))
        w_before_wrist = sigmoid_t((arm_len - t) / max(arm_sigma, 1e-8))
        w_arm = w_out * w_arm_axis * w_before_wrist

        # hand region mask
        d_wrist = torch.linalg.norm(v - wrist[None, :], dim=1)
        w_hand_local = torch.exp(-(d_wrist * d_wrist) / (2.0 * max(hand_keep_r * hand_keep_r, 1e-12)))
        w_after_wrist = sigmoid_t((t - arm_len) / max(hand_after_sigma, 1e-8))
        w_hand = torch.maximum(w_hand_local, w_after_wrist * w_arm_axis)

        # overlap 제거
        w_arm_eff = w_arm * (1.0 - w_hand)

        # arm shortening (only until wrist)
        delta_t_arm = (scale - 1.0) * torch.clamp(t, 0.0, float(arm_len.item()))
        delta_arm = (w_arm_eff * delta_t_arm)[:, None] * u[None, :]

        # rigid hand translation = wrist movement
        wrist_translation = ((scale - 1.0) * arm_len) * u
        delta_hand = w_hand[:, None] * wrist_translation[None, :]

        v = v + delta_arm + delta_hand

    _apply_arm(ls, lw)
    _apply_arm(rs, rw)

    # (3) torso y scale
    s_torso = 1.0 + (params.torso_y_scale - 1.0) * w_torso
    v[:, 1] = pelvis[1] + (v[:, 1] - pelvis[1]) * s_torso

    # (4) leg y scale (below pelvis)
    y = v[:, 1]
    w_leg = sigmoid_t((pelvis[1] - y) / leg_sigma)
    s_leg = 1.0 + (params.leg_y_scale - 1.0) * w_leg
    v[:, 1] = pelvis[1] + (v[:, 1] - pelvis[1]) * s_leg

    return v


# =========================
# Best params parsing (txt)
# =========================
def _find_float(pattern: str, text: str) -> Optional[float]:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    if not m:
        return None
    try:
        return float(m.group(1))
    except:
        return None


def load_best_params_txt(path: str) -> Tuple[TemplateMorphParams, Dict[str, float]]:
    """
    Expected in txt:
      head_scale: ...
      shoulder_scale: ...
      leg_y_scale: ...
      torso_y_scale: ...
      arm_len_scale: ...
      delta_small_leg: ...
      delta_small_torso: ...
      delta_small_arm: ...
    """
    with open(path, "r", encoding="utf-8") as f:
        txt = f.read()

    hs = _find_float(r"head_scale\s*:\s*([-\d\.eE]+)", txt) or 1.06
    ss = _find_float(r"shoulder_scale\s*:\s*([-\d\.eE]+)", txt) or 1.02
    ls = _find_float(r"leg_y_scale\s*:\s*([-\d\.eE]+)", txt) or 1.08
    ts = _find_float(r"torso_y_scale\s*:\s*([-\d\.eE]+)", txt) or 0.88
    als = _find_float(r"arm_len_scale\s*:\s*([-\d\.eE]+)", txt) or 0.96

    tp = TemplateMorphParams(
        head_scale=float(hs),
        shoulder_scale=float(ss),
        leg_y_scale=float(ls),
        torso_y_scale=float(ts),
        arm_len_scale=float(als),
    )
    tp = clamp_params(tp)

    d_small_leg = _find_float(r"delta_small_leg\s*:\s*([-\d\.eE]+)", txt)
    d_small_torso = _find_float(r"delta_small_torso\s*:\s*([-\d\.eE]+)", txt)
    d_small_arm = _find_float(r"delta_small_arm\s*:\s*([-\d\.eE]+)", txt)

    deltas = {
        "delta_small_leg": float(d_small_leg) if d_small_leg is not None else 0.01,
        "delta_small_torso": float(d_small_torso) if d_small_torso is not None else -0.015,
        "delta_small_arm": float(d_small_arm) if d_small_arm is not None else -0.03,
    }
    return tp, deltas


# =========================
# Kid height prior
# =========================
def load_kid_heights(kid_audit_csv: str) -> np.ndarray:
    df = pd.read_csv(kid_audit_csv)
    if "real_h" not in df.columns:
        raise RuntimeError("kid_audit_csv must contain column 'real_h'")
    kid_heights = df["real_h"].dropna().to_numpy(dtype=np.float64)
    lo = np.quantile(kid_heights, TRIM_Q[0])
    hi = np.quantile(kid_heights, TRIM_Q[1])
    kid_heights = kid_heights[(kid_heights >= lo) & (kid_heights <= hi)]
    return kid_heights


def sample_target_kid_height(kid_heights: np.ndarray, adult_h: float, rng: np.random.Generator) -> float:
    for _ in range(120):
        t = float(rng.choice(kid_heights))
        if (TARGET_RANGE[0] <= t <= TARGET_RANGE[1]) and (t < adult_h * DOWNSCALE_MARGIN):
            return t
    t = min(max(TARGET_RANGE[0], adult_h * 0.75), TARGET_RANGE[1])
    return float(min(t, adult_h * DOWNSCALE_MARGIN))


# =========================
# Core conversion
# =========================
@torch.no_grad()
def convert_one_pkl(
    model_root: str,
    model_adult,
    faces: np.ndarray,
    kid_heights: np.ndarray,
    best_mid: TemplateMorphParams,
    best_small_deltas: Dict[str, float],
    in_pkl_path: str,
    seed: int,
    export_obj: bool,
    export_ply: bool,
    out_dir: str,
    out_prefix: str,
) -> dict:
    data = load_pkl(in_pkl_path)
    num_betas = int(model_adult.num_betas)

    pose_bundle = _get_pose_bundle_from_data(data)

    # read tensors
    betas = get_tensor(data, "betas", num_betas, default_zero=True)

    if "expression" in data and data["expression"] is not None:
        expression = get_tensor(data, "expression", 10, default_zero=True)
    else:
        expression = torch.zeros((1, 10), device=DEVICE, dtype=torch.float32)

    # explicit key 우선, 없으면 bundled pose 사용
    if ("global_orient" in data and data["global_orient"] is not None):
        global_orient = get_tensor(data, "global_orient", 3)
    else:
        global_orient = fix_lastdim(
            to_torch(pose_bundle.get("global_orient", np.zeros(3, dtype=np.float32))), 3
        )

    if ("body_pose" in data and data["body_pose"] is not None):
        body_pose = get_tensor(data, "body_pose", 63)
    else:
        body_pose = fix_lastdim(
            to_torch(pose_bundle.get("body_pose", np.zeros(63, dtype=np.float32))), 63
        )

    transl = get_tensor(data, "transl", 3, default_zero=True)

    if ("left_hand_pose" in data and data["left_hand_pose"] is not None):
        left_hand_pose = get_tensor(data, "left_hand_pose", 45, default_zero=True)
    else:
        left_hand_pose = fix_lastdim(
            to_torch(pose_bundle.get("left_hand_pose", np.zeros(45, dtype=np.float32))), 45
        )

    if ("right_hand_pose" in data and data["right_hand_pose"] is not None):
        right_hand_pose = get_tensor(data, "right_hand_pose", 45, default_zero=True)
    else:
        right_hand_pose = fix_lastdim(
            to_torch(pose_bundle.get("right_hand_pose", np.zeros(45, dtype=np.float32))), 45
        )

    if ("jaw_pose" in data and data["jaw_pose"] is not None):
        jaw_pose = get_tensor(data, "jaw_pose", 3, default_zero=True)
    else:
        jaw_pose = fix_lastdim(
            to_torch(pose_bundle.get("jaw_pose", np.zeros(3, dtype=np.float32))), 3
        )

    if ("leye_pose" in data and data["leye_pose"] is not None):
        leye_pose = get_tensor(data, "leye_pose", 3, default_zero=True)
    else:
        leye_pose = fix_lastdim(
            to_torch(pose_bundle.get("leye_pose", np.zeros(3, dtype=np.float32))), 3
        )

    if ("reye_pose" in data and data["reye_pose"] is not None):
        reye_pose = get_tensor(data, "reye_pose", 3, default_zero=True)
    else:
        reye_pose = fix_lastdim(
            to_torch(pose_bundle.get("reye_pose", np.zeros(3, dtype=np.float32))), 3
        )

    # Adult canonical (height + metrics)
    vA_can, jA_can = forward_canonical(model_adult, betas=betas, expression=expression)
    h_adult_can = float(bbox_height_y_t(vA_can).item())
    mA_can = metrics_from_joints_np(jA_can.detach().cpu().numpy())
    rA_can = ratios_from_metrics(mA_can)

    # Adult posed height (for reporting)
    outA_pose = model_adult(
        betas=betas,
        global_orient=global_orient,
        body_pose=body_pose,
        transl=transl,
        left_hand_pose=left_hand_pose,
        right_hand_pose=right_hand_pose,
        jaw_pose=jaw_pose,
        leye_pose=leye_pose,
        reye_pose=reye_pose,
        expression=expression,
        return_verts=True,
    )
    vA_pose = outA_pose.vertices[0]
    h_adult_pose = float(bbox_height_y_t(vA_pose).item())

    # sample target height (deterministic per sample)
    rng = np.random.default_rng(int(seed))
    h_target = sample_target_kid_height(kid_heights, h_adult_can, rng)

    # deltas
    p_mid = clamp_params(best_mid)

    delta_small = {
        "head_scale": -0.02,
        "shoulder_scale": +0.08,
        "leg_y_scale": float(best_small_deltas.get("delta_small_leg", 0.01)),
        "torso_y_scale": float(best_small_deltas.get("delta_small_torso", -0.015)),
        "arm_len_scale": float(best_small_deltas.get("delta_small_arm", -0.03)),
    }
    delta_tall = {
        "head_scale": -0.04,
        "shoulder_scale": -0.02,
        "leg_y_scale": -0.04,
        "torso_y_scale": +0.02,
        "arm_len_scale": -0.01,
    }
    delta_peak = {
        "head_scale": -0.01,
        "shoulder_scale": +0.02,
        "leg_y_scale": +0.10,
        "torso_y_scale": 0.00,
        "arm_len_scale": 0.00,
    }

    p_small = _apply_delta(p_mid, delta_small) if USE_HEIGHT_ADAPTIVE_TEMPLATE else p_mid
    p_tall  = _apply_delta(p_mid, delta_tall) if USE_HEIGHT_ADAPTIVE_TEMPLATE else p_mid
    p_peak  = _apply_delta(p_mid, delta_peak) if (USE_HEIGHT_ADAPTIVE_TEMPLATE and USE_MID_PEAK_TEMPLATE) else p_mid

    # build templates
    v_template_mid = build_child_template(model_adult, p_mid)
    if USE_HEIGHT_ADAPTIVE_TEMPLATE:
        v_template_small = build_child_template(model_adult, p_small)
        v_template_tall  = build_child_template(model_adult, p_tall)
        v_template_peak  = build_child_template(model_adult, p_peak)
    else:
        v_template_small = v_template_mid
        v_template_tall = v_template_mid
        v_template_peak = v_template_mid

    # child model = copy adult weights, replace v_template
    model_child = smplx.create(
        model_root,
        model_type="smplx",
        gender="neutral",
        use_pca=False,
        batch_size=1,
        num_betas=num_betas,
    ).to(DEVICE)
    model_child.load_state_dict(model_adult.state_dict())
    model_child.eval()

    # effective template by weights
    w_small, w_mid, w_peak, w_tall = _height_weights(h_target)
    v_template_eff = _blend_templates4(
        v_template_small, v_template_mid, v_template_peak, v_template_tall,
        w_small, w_mid, w_peak, w_tall
    )
    _set_model_template(model_child, v_template_eff)

    # child betas
    betas_child = betas * BETAS_MIX
    if betas_child.shape[-1] >= 2:
        betas_child[:, 0] = betas_child[:, 0] + BETAS0_OFFSET
        betas_child[:, 1] = betas_child[:, 1] + BETAS1_OFFSET

    # child canonical raw -> scale_final
    vC_can_raw, jC_can_raw = forward_canonical(model_child, betas=betas_child, expression=expression)
    h_child_can_raw = float(bbox_height_y_t(vC_can_raw).item())
    scale_final = float(h_target / max(h_child_can_raw, 1e-8))

    # canonical final (scaled about canonical pelvis) - for analysis only
    pelvisC_can = pelvis_from_joints(jC_can_raw)
    vC_can_final = pelvisC_can[None, :] + (vC_can_raw - pelvisC_can[None, :]) * scale_final
    jC_can_final = regress_joints_from_verts(model_child, vC_can_final)
    h_child_can_final = float(bbox_height_y_t(vC_can_final).item())

    mC_can = metrics_from_joints_np(jC_can_final.detach().cpu().numpy())
    rC_can = ratios_from_metrics(mC_can)

    # posed child vertices
    outC_pose = model_child(
        betas=betas_child,
        global_orient=global_orient,
        body_pose=body_pose,
        transl=transl,
        left_hand_pose=left_hand_pose,
        right_hand_pose=right_hand_pose,
        jaw_pose=jaw_pose,
        leye_pose=leye_pose,
        reye_pose=reye_pose,
        expression=expression,
        return_verts=True,
    )
    vC_pose_raw = outC_pose.vertices[0]
    jC_pose_raw = regress_joints_from_verts(model_child, vC_pose_raw) if USE_JOINTS_FROM_V else outC_pose.joints[0]
    pelvisC_pose = pelvis_from_joints(jC_pose_raw)

    # scale posed mesh about posed pelvis
    vC_pose_final = pelvisC_pose[None, :] + (vC_pose_raw - pelvisC_pose[None, :]) * scale_final
    h_child_pose_final = float(bbox_height_y_t(vC_pose_final).item())
    verts_np = vC_pose_final.detach().cpu().numpy()

    # deltas for reporting
    len_delta = deltas_dict(mA_can, mC_can)
    ratio_delta = deltas_dict(rA_can, rC_can)

    # outputs
    ensure_dir(out_dir)
    base = os.path.join(out_dir, out_prefix)

    if export_obj:
        export_mesh(base + "_child.obj", verts_np, faces)
    if export_ply:
        export_mesh(base + "_child.ply", verts_np, faces)

    meta = {
        "in_pkl": in_pkl_path,

        # heights
        "adult_h_canonical": h_adult_can,
        "adult_h_posed": h_adult_pose,
        "target_kid_h": h_target,
        "child_h_canonical_raw": h_child_can_raw,
        "child_h_canonical_final": h_child_can_final,
        "child_h_posed_final": h_child_pose_final,
        "scale_final": scale_final,

        # adaptive weights
        "w_small": float(w_small),
        "w_mid": float(w_mid),
        "w_peak": float(w_peak),
        "w_tall": float(w_tall),

        # params used
        "mid_params": {
            "head_scale": float(p_mid.head_scale),
            "shoulder_scale": float(p_mid.shoulder_scale),
            "leg_y_scale": float(p_mid.leg_y_scale),
            "torso_y_scale": float(p_mid.torso_y_scale),
            "arm_len_scale": float(p_mid.arm_len_scale),
            "arm_sigma_out": float(p_mid.arm_sigma_out),
            "arm_radius": float(p_mid.arm_radius),
            "arm_out_offset": float(p_mid.arm_out_offset),
            "hand_keep_radius": float(p_mid.hand_keep_radius),
            "hand_after_sigma": float(p_mid.hand_after_sigma),
        },
        "small_deltas_from_txt": {
            "delta_small_leg": float(best_small_deltas.get("delta_small_leg", 0.01)),
            "delta_small_torso": float(best_small_deltas.get("delta_small_torso", -0.015)),
            "delta_small_arm": float(best_small_deltas.get("delta_small_arm", -0.03)),
        },

        # what changed (lengths + ratios + deltas)
        "lengths_adult_canonical": mA_can,
        "lengths_child_canonical_final": mC_can,
        "lengths_delta(child-adult)": len_delta,

        "ratios_adult_canonical": rA_can,
        "ratios_child_canonical_final": rC_can,
        "ratios_delta(child-adult)": ratio_delta,
    }

    save_json(base + "_meta.json", meta)
    return meta


# =========================
# CLI main
# =========================
def read_list(path: str) -> List[str]:
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f.readlines()]
    return [x for x in lines if x and (not x.startswith("#"))]


def _infer_num_betas_from_loaded(data: dict) -> int:
    if "betas" in data and data["betas"] is not None:
        b = np.asarray(data["betas"])
        if b.ndim == 0:
            return 1
        if b.ndim == 1:
            return int(b.shape[0])
        return int(b.shape[-1])

    for alt in ["pred_shape", "shape", "shapes", "pred_betas", "shape_params"]:
        if alt in data and data[alt] is not None:
            b = np.asarray(data[alt])
            if b.ndim == 0:
                return 1
            if b.ndim == 1:
                return int(b.shape[0])
            return int(b.shape[-1])

    return 10


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model_root", required=True)
    ap.add_argument("--kid_audit_csv", required=True)
    ap.add_argument("--best_params_txt", required=True)

    ap.add_argument("--in_pkl", default="")
    ap.add_argument("--in_list", default="")
    ap.add_argument("--out_dir", required=True)

    ap.add_argument("--export_obj", type=int, default=1)
    ap.add_argument("--export_ply", type=int, default=0)

    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--n_max", type=int, default=0, help="0 = all")
    ap.add_argument("--log_csv", default="kidify_server_log.csv")
    args = ap.parse_args()

    in_paths: List[str]
    if args.in_pkl:
        in_paths = [args.in_pkl]
    elif args.in_list:
        in_paths = read_list(args.in_list)
    else:
        raise RuntimeError("Provide --in_pkl or --in_list")

    if args.n_max and args.n_max > 0:
        in_paths = in_paths[: int(args.n_max)]

    best_mid, small_d = load_best_params_txt(args.best_params_txt)
    kid_heights = load_kid_heights(args.kid_audit_csv)

    # infer num_betas from normalized first sample
    s0 = load_pkl(in_paths[0])
    num_betas = int(_infer_num_betas_from_loaded(s0))

    # adult model
    model_adult = smplx.create(
        args.model_root,
        model_type="smplx",
        gender="neutral",
        use_pca=False,
        batch_size=1,
        num_betas=num_betas,
    ).to(DEVICE)
    model_adult.eval()
    faces = np.asarray(getattr(model_adult, "faces"))

    ensure_dir(args.out_dir)
    log_path = os.path.join(args.out_dir, args.log_csv)

    # CSV columns (server-friendly)
    fieldnames = [
        "idx", "in_pkl",
        "adult_h_canonical", "adult_h_posed",
        "target_kid_h",
        "child_h_canonical_raw", "child_h_canonical_final", "child_h_posed_final",
        "scale_final",
        "w_small", "w_mid", "w_peak", "w_tall",
        "mid_head_scale", "mid_shoulder_scale", "mid_leg_y_scale", "mid_torso_y_scale", "mid_arm_len_scale",
        "delta_small_leg", "delta_small_torso", "delta_small_arm",

        # key ratios (adult/child + delta)
        "A_head_over_torso", "C_head_over_torso", "D_head_over_torso",
        "A_shoulder_over_torso", "C_shoulder_over_torso", "D_shoulder_over_torso",
        "A_leg_over_torso", "C_leg_over_torso", "D_leg_over_torso",
        "A_shoulder_over_leg", "C_shoulder_over_leg", "D_shoulder_over_leg",
        "A_arm_over_torso", "C_arm_over_torso", "D_arm_over_torso",

        "out_prefix",
    ]

    with open(log_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()

        for i, p in enumerate(in_paths, 1):
            try:
                stem = os.path.splitext(os.path.basename(p))[0]
                out_prefix = f"{i:06d}_{stem}"

                meta = convert_one_pkl(
                    model_root=args.model_root,
                    model_adult=model_adult,
                    faces=faces,
                    kid_heights=kid_heights,
                    best_mid=best_mid,
                    best_small_deltas=small_d,
                    in_pkl_path=p,
                    seed=args.seed + i,
                    export_obj=bool(args.export_obj),
                    export_ply=bool(args.export_ply),
                    out_dir=args.out_dir,
                    out_prefix=out_prefix,
                )

                A = meta["ratios_adult_canonical"]
                C = meta["ratios_child_canonical_final"]
                D = meta["ratios_delta(child-adult)"]

                row = {
                    "idx": i,
                    "in_pkl": meta["in_pkl"],
                    "adult_h_canonical": meta["adult_h_canonical"],
                    "adult_h_posed": meta["adult_h_posed"],
                    "target_kid_h": meta["target_kid_h"],
                    "child_h_canonical_raw": meta["child_h_canonical_raw"],
                    "child_h_canonical_final": meta["child_h_canonical_final"],
                    "child_h_posed_final": meta["child_h_posed_final"],
                    "scale_final": meta["scale_final"],
                    "w_small": meta["w_small"],
                    "w_mid": meta["w_mid"],
                    "w_peak": meta["w_peak"],
                    "w_tall": meta["w_tall"],
                    "mid_head_scale": meta["mid_params"]["head_scale"],
                    "mid_shoulder_scale": meta["mid_params"]["shoulder_scale"],
                    "mid_leg_y_scale": meta["mid_params"]["leg_y_scale"],
                    "mid_torso_y_scale": meta["mid_params"]["torso_y_scale"],
                    "mid_arm_len_scale": meta["mid_params"]["arm_len_scale"],
                    "delta_small_leg": meta["small_deltas_from_txt"]["delta_small_leg"],
                    "delta_small_torso": meta["small_deltas_from_txt"]["delta_small_torso"],
                    "delta_small_arm": meta["small_deltas_from_txt"]["delta_small_arm"],

                    "A_head_over_torso": A["head_over_torso"],
                    "C_head_over_torso": C["head_over_torso"],
                    "D_head_over_torso": D["head_over_torso"],

                    "A_shoulder_over_torso": A["shoulder_over_torso"],
                    "C_shoulder_over_torso": C["shoulder_over_torso"],
                    "D_shoulder_over_torso": D["shoulder_over_torso"],

                    "A_leg_over_torso": A["leg_over_torso"],
                    "C_leg_over_torso": C["leg_over_torso"],
                    "D_leg_over_torso": D["leg_over_torso"],

                    "A_shoulder_over_leg": A["shoulder_over_leg"],
                    "C_shoulder_over_leg": C["shoulder_over_leg"],
                    "D_shoulder_over_leg": D["shoulder_over_leg"],

                    "A_arm_over_torso": A["arm_over_torso"],
                    "C_arm_over_torso": C["arm_over_torso"],
                    "D_arm_over_torso": D["arm_over_torso"],

                    "out_prefix": out_prefix,
                }
                w.writerow(row)

                if (i % 20 == 0) or (i == len(in_paths)):
                    print(f"[OK] {i}/{len(in_paths)}  out_prefix={out_prefix}")

            except Exception as e:
                print(f"[ERR] {i}/{len(in_paths)}  {type(e).__name__}: {e}")

            if DEVICE.startswith("cuda") and (i % 200 == 0):
                torch.cuda.empty_cache()

    print(f"[DONE] log_csv: {log_path}")
    print("[DONE] all finished.")


if __name__ == "__main__":
    main()
