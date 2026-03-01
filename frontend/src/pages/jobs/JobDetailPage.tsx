import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Tabs from "../../shared/components/common/Tabs";
import Viewer3D from "../../features/viewer/components/Viewer3D";
import CompareViewer3D from "../../features/viewer/components/CompareViewer3D";

import { deleteJob, getJob, type ArtifactItem, type JobItem } from "../../features/jobs/backendApi";
import { toAbsoluteUrl } from "../../features/api/baseUrl";

type JobTabKey = "viewer" | "analysis" | "reports" | "logs" | "downloads";

export default function JobDetailPage() {
  const { jobId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab] = useState<JobTabKey>("viewer");

  const { data: job, isLoading, error } = useQuery({
    queryKey: ["job", jobId],
    enabled: Boolean(jobId),
    queryFn: () => getJob(jobId as string),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => {
      if (q.state.status === "error") return false; // 404 등 반복 방지
      const j = q.state.data as JobItem | undefined;
      if (!j) return 1000;
      return j.status === "done" || j.status === "failed" ? false : 1000;
    },
  });

  const mDelete = useMutation({
    mutationFn: () => deleteJob(jobId as string),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      await qc.invalidateQueries({ queryKey: ["job", jobId] });
      nav("/app/history");
    },
  });

  if (!jobId) return <h1>Job Detail</h1>;

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1100 }}>
        <h1>Job Detail</h1>
        <div style={{ color: "#666" }}>Loading...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div style={{ maxWidth: 1100 }}>
        <h1>Job Detail</h1>
        <div style={{ color: "#b42318" }}>Failed to load job.</div>
        <div style={{ marginTop: 12 }}>
          <Link to="/app/history">← Back to History</Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "viewer", label: "Viewer" },
    { key: "analysis", label: "Analysis" },
    { key: "reports", label: "Reports" },
    { key: "logs", label: "Logs" },
    { key: "downloads", label: "Downloads" },
  ];

  const artifacts = job.artifacts ?? [];
  const modelArtifacts = artifacts.filter((a) => a.kind === "model");
  const reportArtifacts = artifacts.filter((a) => a.kind === "report");
  const logArtifacts = artifacts.filter((a) => a.kind === "text");

  const title = ((job as any).title ?? "") as string;
  const displayTitle = title.trim() ? title.trim() : job.id;

  const canDelete = job.status === "done" || job.status === "failed";

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayTitle}
          </h1>
          <div style={{ color: "#444" }}>
            id=<b>{job.id}</b> · type=<b>{job.pipelineType}</b> · status=<b>{job.status}</b> · progress=
            <b>{Math.round((job.progress ?? 0) * 100)}%</b>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            {new Date(job.createdAt).toLocaleString()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton label="Refresh" onClick={() => window.location.reload()} />

          <button
            type="button"
            disabled={!canDelete || mDelete.isPending}
            onClick={() => {
              if (!canDelete) return;
              const ok = window.confirm(
                `Delete this job?\n\n- title: ${displayTitle}\n- id: ${job.id}\n\nThis will remove files on the server as well.`
              );
              if (!ok) return;
              mDelete.mutate();
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #f3c5c5",
              background: "#fff5f5",
              color: "#b42318",
              cursor: !canDelete || mDelete.isPending ? "not-allowed" : "pointer",
              fontWeight: 1000,
              fontSize: 12,
              opacity: !canDelete || mDelete.isPending ? 0.5 : 1,
            }}
            title={!canDelete ? "Only done/failed jobs can be deleted (v1)." : "Delete job"}
          >
            {mDelete.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, marginTop: 14, minWidth: 0 }}>
        {/* Left */}
        <Panel title="Pipeline">
          <StepList />

          <div style={{ marginTop: 14, fontWeight: 900 }}>Artifacts</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {artifacts.length === 0 ? (
              <div style={{ color: "#666", fontSize: 13 }}>No artifacts yet.</div>
            ) : (
              artifacts.map((a) => (
                <a
                  key={a.id}
                  href={toAbsoluteUrl(a.url)}
                  target="_blank"
                  rel="noreferrer"
                  style={artifactLinkStyle}
                  title={toAbsoluteUrl(a.url)}
                >
                  {a.label} <span style={{ color: "#777", fontWeight: 700 }}>({a.kind})</span>
                </a>
              ))
            )}
          </div>
        </Panel>

        {/* Right */}
        <Panel title="Workspace">
          <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as JobTabKey)} />

          <div style={{ marginTop: 12 }}>
            {tab === "viewer" && <ViewerTab models={modelArtifacts} />}
            {tab === "analysis" && <AnalysisTab />}
            {tab === "reports" && <ReportsTab jobId={job.id} reports={reportArtifacts} jobUpdatedAt={job.updatedAt} />}
            {tab === "logs" && <LogsTab logs={logArtifacts} />}
            {tab === "downloads" && <DownloadsTab artifacts={artifacts} jobUpdatedAt={job.updatedAt} />}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link to="/app/history">← Back to History</Link>
      </div>
    </div>
  );
}

function ViewerTab({ models }: { models: ArtifactItem[] }) {
  const [viewMode, setViewMode] = useState<"single" | "compare">("compare");
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  useEffect(() => {
    if (models.length === 0) return;
    if (!leftId) setLeftId(models[0].id);
    if (!rightId) setRightId(models[1]?.id ?? models[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  const left = useMemo(() => models.find((m) => m.id === leftId) ?? null, [models, leftId]);
  const right = useMemo(() => models.find((m) => m.id === rightId) ?? null, [models, rightId]);

  const leftUrl = left ? toAbsoluteUrl(left.url) : "";
  const rightUrl = right ? toAbsoluteUrl(right.url) : "";

  if (models.length === 0) return <div style={{ color: "#666" }}>No model artifacts yet.</div>;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setViewMode("single")} style={pillStyle(viewMode === "single")}>
          Single
        </button>
        <button type="button" onClick={() => setViewMode("compare")} style={pillStyle(viewMode === "compare")}>
          Compare
        </button>
      </div>

      {viewMode === "single" ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Model</span>
            <select value={leftId} onChange={(e) => setLeftId(e.target.value)} style={selectStyle}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <Viewer3D objUrl={leftUrl} />

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            loaded=<b>{left?.label}</b>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end", minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Left</div>
              <select value={leftId} onChange={(e) => setLeftId(e.target.value)} style={selectStyleFull}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Right</div>
              <select value={rightId} onChange={(e) => setRightId(e.target.value)} style={selectStyleFull}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10, minWidth: 0 }}>
            <CompareViewer3D leftObjUrl={leftUrl} rightObjUrl={rightUrl} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsTab({ jobId, reports, jobUpdatedAt }: { jobId: string; reports: ArtifactItem[]; jobUpdatedAt: string }) {
  // ✅ 캐시 회피: jobUpdatedAt을 v로 붙임 (원하면 제거 가능)
  const withV = (url: string) => `${toAbsoluteUrl(url)}?v=${encodeURIComponent(jobUpdatedAt)}`;

  const summary = reports.find((r) => r.label.toLowerCase() === "summary.json");
  const pdf = reports.find((r) => r.label.toLowerCase().endsWith(".pdf"));
  const html = reports.find((r) => r.label.toLowerCase().endsWith(".html") || r.label.toLowerCase().endsWith(".htm"));

  return (
    <div>
      <div style={{ color: "#555", fontSize: 13, lineHeight: 1.4 }}>
        이 탭은 <b>최종 산출물(리포트)</b>만 보여줍니다. (검수/공유/제출 용도)
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pdf ? (
          <a href={withV(pdf.url)} target="_blank" rel="noreferrer" style={primaryLinkBtn}>
            Open PDF
          </a>
        ) : (
          <span style={{ ...ghostPill, opacity: 0.6 }}>PDF 없음</span>
        )}

        {html ? (
          <a href={withV(html.url)} target="_blank" rel="noreferrer" style={ghostLinkBtn}>
            Open HTML
          </a>
        ) : (
          <span style={{ ...ghostPill, opacity: 0.6 }}>HTML 없음</span>
        )}

        {summary ? (
          <a href={withV(summary.url)} target="_blank" rel="noreferrer" style={ghostLinkBtn}>
            Open summary.json
          </a>
        ) : (
          <span style={{ ...ghostPill, opacity: 0.6 }}>summary 없음</span>
        )}

        <Link to={`/app/reports?jobId=${jobId}`} style={ghostLinkBtn}>
          Open Reports page →
        </Link>
      </div>

      <div style={{ marginTop: 14 }}>
        <SmallPanel title="Report files">
          {reports.length === 0 ? (
            <div style={{ color: "#666", fontSize: 13 }}>No reports yet.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {reports.map((r) => (
                <li key={r.id}>
                  <a href={withV(r.url)} target="_blank" rel="noreferrer" style={{ color: "#111" }}>
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </SmallPanel>
      </div>
    </div>
  );
}

const primaryLinkBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 1000,
  fontSize: 12,
  display: "inline-block",
} as const;

const ghostLinkBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  fontWeight: 1000,
  fontSize: 12,
  display: "inline-block",
} as const;

const ghostPill = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fafafa",
  color: "#666",
  fontWeight: 900,
  fontSize: 12,
  display: "inline-block",
} as const;

function LogsTab({ logs }: { logs: ArtifactItem[] }) {
  return (
    <div>
      <SmallPanel title="Logs">
        {logs.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No logs yet.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {logs.map((l) => (
              <li key={l.id}>
                <a href={toAbsoluteUrl(l.url)} target="_blank" rel="noreferrer" style={{ color: "#111" }}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </SmallPanel>
    </div>
  );
}

function DownloadsTab({ artifacts, jobUpdatedAt }: { artifacts: ArtifactItem[]; jobUpdatedAt: string }) {
  const withV = (url: string) => `${toAbsoluteUrl(url)}?v=${encodeURIComponent(jobUpdatedAt)}`;

  return (
    <div>
      <SmallPanel title="Downloads">
        {artifacts.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No artifacts.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {artifacts.map((a) => (
              <a key={a.id} href={withV(a.url)} target="_blank" rel="noreferrer" style={artifactLinkStyle}>
                {a.label} <span style={{ color: "#777", fontWeight: 700 }}>({a.kind})</span>
              </a>
            ))}
          </div>
        )}
      </SmallPanel>
    </div>
  );
}

function AnalysisTab() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <SmallPanel title="Mesh Displacement Heatmap (mock)">
        <div style={{ height: 180, borderRadius: 12, border: "1px dashed #bbb", background: "#fafafa" }} />
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>Next: connect real metrics.</div>
      </SmallPanel>

      <SmallPanel title="Joint / Ratio Metrics (mock)">
        <MetricRow name="Height ratio" before="1.00" after="0.78" diff="-0.22" />
        <MetricRow name="Upper leg" before="42.1cm" after="34.0cm" diff="-8.1cm" />
        <MetricRow name="Lower leg" before="39.0cm" after="31.4cm" diff="-7.6cm" />
        <MetricRow name="Arm length" before="58.2cm" after="46.0cm" diff="-12.2cm" />
      </SmallPanel>
    </div>
  );
}

function StepList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <StepCard title="1) Preprocess" items={["Segmentation", "Depth", "Skeleton"]} />
      <StepCard title="2) Reconstruction / Fitting" items={["3D Mesh / SMPL-X fit"]} />
      <StepCard title="3) Transform" items={["Adult → Child morphology"]} />
      <StepCard title="4) Export" items={["Mesh / Params", "Preview", "Report"]} />
    </div>
  );
}

function StepCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#555", fontSize: 13 }}>
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#fff",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff", minWidth: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function SmallPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function MetricRow({ name, before, after, diff }: { name: string; before: string; after: string; diff: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8, padding: "6px 0" }}>
      <div style={{ fontSize: 13, color: "#333" }}>{name}</div>
      <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>{before}</div>
      <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>{after}</div>
      <div style={{ fontSize: 12, color: "#111", textAlign: "right", fontWeight: 800 }}>{diff}</div>
    </div>
  );
}

function pillStyle(active: boolean) {
  return {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  } as const;
}

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const selectStyleFull = {
  ...selectStyle,
  width: "100%",
} as const;

const artifactLinkStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #eee",
  background: "#fff",
  textDecoration: "none",
  color: "#111",
  fontSize: 13,
  fontWeight: 800,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "block",
} as const;