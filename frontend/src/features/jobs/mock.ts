import type { PresetId, PipelineType } from "./types";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobRow {
  id: string;
  pipelineType: PipelineType;
  presetId: PresetId;
  status: JobStatus;
  createdAt: string; // ISO
  progress?: number; // 0~1
}

export const mockJobs: JobRow[] = [
  {
    id: "job_0001",
    pipelineType: "image_to_3d",
    presetId: "balanced",
    status: "done",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "job_0002",
    pipelineType: "smplx_to_child",
    presetId: "quality",
    status: "running",
    progress: 0.42,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "job_0003",
    pipelineType: "image_to_3d",
    presetId: "fast",
    status: "queued",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: "job_0004",
    pipelineType: "smplx_to_child",
    presetId: "balanced",
    status: "failed",
    createdAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
  },
];

export function isInQueue(s: JobStatus) {
  return s === "queued" || s === "running";
}