import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Tabs from "../../shared/components/common/Tabs";
import Viewer3D from "../../features/viewer/components/Viewer3D";
import CompareViewer3D from "../../features/viewer/components/CompareViewer3D";
import { mockJobs } from "../../features/jobs/mock";

type JobTabKey = "viewer" | "analysis" | "reports" | "logs" | "downloads";

export default function JobDetailPage() {
  const { jobId } = useParams();
  const [tab, setTab] = useState<JobTabKey>("viewer");

  const job = useMemo(() => mockJobs.find((j) => j.id === jobId), [jobId]);

  if (!jobId) return <h1>Job Detail</h1>;
  if (!job) {
    return (
      <div>
        <h1>Job Detail</h1>
        <p>Job not found: {jobId}</p>
        <Link to="/app/history">Go to History</Link>
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

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>Job Detail</h1>
          <div style={{ color: "#444" }}>
            id=<b>{job.id}</b> · type=<b>{job.pipelineType}</b> · preset=<b>{job.presetId}</b> · status=<b>{job.status}</b>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            {new Date(job.createdAt).toLocaleString()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton label="Retry" onClick={() => alert("mock retry (later: POST /jobs/:id/retry)")} />
          <ActionButton label="Duplicate" onClick={() => alert("mock duplicate (later: POST /jobs/:id/duplicate)")} />
          {job.status === "running" ? (
            <ActionButton label="Cancel" onClick={() => alert("mock cancel (later: POST /jobs/:id/cancel)")} />
          ) : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, marginTop: 14, minWidth: 0 }}>
        {/* Left */}
        <Panel title="Pipeline">
          <StepList />
        </Panel>

        {/* Right */}
        <Panel title="Workspace">
          <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as JobTabKey)} />

          <div style={{ marginTop: 12 }}>
            {tab === "viewer" && <ViewerTab />}
            {tab === "analysis" && <AnalysisTab />}
            {tab === "reports" && <ReportsTab />}
            {tab === "logs" && <LogsTab />}
            {tab === "downloads" && <DownloadsTab />}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link to="/app/history">← Back to History</Link>
      </div>
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

/* -------------------- Tabs (mock content) -------------------- */

function ViewerTab() {
  const [viewMode, setViewMode] = useState<"single" | "compare">("compare");
  const [leftObj, setLeftObj] = useState<string>("03_child.obj");
  const [rightObj, setRightObj] = useState<string>("03_child.obj");

  const modelOptions = [
    { label: "03_child.obj", file: "03_child.obj" },
    { label: "03_scaleonly.obj", file: "03_scaleonly.obj" },
    { label: "04_adult.obj", file: "04_adult.obj" },
  ];

  const leftUrl = `/models/${leftObj}`;
  const rightUrl = `/models/${rightObj}`;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setViewMode("single")} style={pillStyle(viewMode === "single")}>
          Single
        </button>
        <button type="button" onClick={() => setViewMode("compare")} style={pillStyle(viewMode === "compare")}>
          Compare
        </button>

        <TogglePill label="Skeleton Overlay" />
        <TogglePill label="Seg Overlay" />
      </div>

      {viewMode === "single" ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#666" }}>OBJ</span>
            <select value={leftObj} onChange={(e) => setLeftObj(e.target.value)} style={selectStyle}>
              {modelOptions.map((m) => (
                <option key={m.file} value={m.file}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <Viewer3D objUrl={leftUrl} />

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            loaded=<b>{leftUrl}</b>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          {/* 상단 선택 바 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end", minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Original (Left)</div>
              <select value={leftObj} onChange={(e) => setLeftObj(e.target.value)} style={selectStyleFull}>
                {modelOptions.map((m) => (
                  <option key={m.file} value={m.file}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Child (Right)</div>
              <select value={rightObj} onChange={(e) => setRightObj(e.target.value)} style={selectStyleFull}>
                {modelOptions.map((m) => (
                  <option key={m.file} value={m.file}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ✅ 여기가 핵심: CompareViewer3D는 자체가 2칸을 만들기 때문에 바깥 grid로 감싸지 않음 */}
          <div style={{ marginTop: 10, minWidth: 0 }}>
            <CompareViewer3D leftObjUrl={leftUrl} rightObjUrl={rightUrl} />
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            left=<b>{leftUrl}</b> · right=<b>{rightUrl}</b>
          </div>
        </div>
      )}
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

function AnalysisTab() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <SmallPanel title="Mesh Displacement Heatmap (mock)">
        <div style={{ height: 180, borderRadius: 12, border: "1px dashed #bbb", background: "#fafafa" }} />
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>Next: show ΔV heatmap.</div>
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

function ReportsTab() {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ActionButton label="Generate HTML" onClick={() => alert("mock: createReport(html)")} />
        <ActionButton label="Generate PDF" onClick={() => alert("mock: createReport(pdf)")} />
      </div>

      <div style={{ marginTop: 12 }}>
        <SmallPanel title="Generated Reports (mock)">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>report_0001.html (view)</li>
            <li>report_0001.pdf (download)</li>
          </ul>
        </SmallPanel>
      </div>
    </div>
  );
}

function LogsTab() {
  return (
    <div>
      <SmallPanel title="Logs (mock)">
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 12,
            background: "#0b1020",
            color: "#d7e0ff",
            fontSize: 12,
            overflowX: "auto",
          }}
        >
{`[preprocess] segmentation done
[preprocess] depth done
[preprocess] skeleton done
[recon] mesh done
[transform] child done
[export] glb exported
[report] html/pdf generated
`}
        </pre>
      </SmallPanel>
    </div>
  );
}

function DownloadsTab() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <SmallPanel title="Outputs (mock)">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>child_mesh.glb</li>
          <li>child_params.npz</li>
          <li>preview.png</li>
        </ul>
      </SmallPanel>

      <SmallPanel title="Actions (mock)">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ActionButton label="Download all (zip)" onClick={() => alert("mock download")} />
          <ActionButton label="Open output folder" onClick={() => alert("mock open folder")} />
        </div>
      </SmallPanel>
    </div>
  );
}

/* -------------------- small helpers -------------------- */

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

function TogglePill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}