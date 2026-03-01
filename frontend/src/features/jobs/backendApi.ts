import { getApiBaseUrl } from "../api/baseUrl";

export type JobStatus = "queued" | "running" | "done" | "failed";

export type ArtifactItem = {
  id: string;
  kind: "model" | "image" | "text" | "report";
  label: string;
  url: string; // backend returns "/files/..."
};

export type JobItem = {
  id: string;
  title?: string;
  pipelineType: "image_to_child" | "smplx_to_child";
  presetId: "fast" | "balanced" | "quality";
  sampleId?: string | null;
  status: JobStatus;
  progress: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
  input?: {
    filename: string | null;
    contentType: string | null;
    savedPath: string | null;
    bytes: number;
  };
  artifacts: ArtifactItem[];
};

export async function listJobs(): Promise<JobItem[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/jobs`);
  if (!res.ok) throw new Error(`listJobs failed: ${res.status}`);
  const data = (await res.json()) as { items: JobItem[] };
  return data.items ?? [];
}

export async function getJob(jobId: string): Promise<JobItem> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`getJob failed: ${res.status}`);
  return (await res.json()) as JobItem;
}

export async function deleteJob(jobId: string): Promise<{ ok: boolean; id: string }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/jobs/${jobId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteJob failed: ${res.status}`);
  return (await res.json()) as { ok: boolean; id: string };
}

export async function createJob(params: {
  title?: string;
  pipelineType: JobItem["pipelineType"];
  presetId: JobItem["presetId"];
  sampleId?: string | null;
  file?: File;
}): Promise<JobItem> {
  const base = getApiBaseUrl();
  const fd = new FormData();
  fd.append("pipelineType", params.pipelineType);
  fd.append("presetId", params.presetId);
  if(params.title) fd.append("title", params.title);
  if (params.sampleId) fd.append("sampleId", params.sampleId);
  if (params.file) fd.append("file", params.file);

  const res = await fetch(`${base}/api/jobs`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`createJob failed: ${res.status}`);
  return (await res.json()) as JobItem;
}