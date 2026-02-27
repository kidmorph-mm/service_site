import { Link } from "react-router-dom";
import type { JobRow } from "../mock";

export default function JobCard({ job }: { job: JobRow }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 14,
        padding: 14,
        background: "#fff",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 800 }}>
          <Link to={`/app/jobs/${job.id}`} style={{ color: "#111", textDecoration: "none" }}>
            {job.id}
          </Link>
        </div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
          type={job.pipelineType} · preset={job.presetId}
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
          {new Date(job.createdAt).toLocaleString()}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <StatusBadge status={job.status} />
        {job.status === "running" && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
            progress: {Math.round((job.progress ?? 0) * 100)}%
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobRow["status"] }) {
  const bg =
    status === "done" ? "#e9f7ef" : status === "failed" ? "#fdecea" : status === "running" ? "#e8f0fe" : "#f2f2f2";
  const fg =
    status === "done" ? "#0f6b3e" : status === "failed" ? "#b42318" : status === "running" ? "#1a56db" : "#555";

  return (
    <span style={{ padding: "6px 10px", borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 800 }}>
      {status}
    </span>
  );
}