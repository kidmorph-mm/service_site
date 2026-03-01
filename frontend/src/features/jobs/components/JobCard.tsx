import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { JobItem } from "../backendApi";
import { deleteJob } from "../backendApi";

export default function JobCard({ job }: { job: JobItem }) {
  const qc = useQueryClient();
  const nav = useNavigate();

  const canDelete = job.status === "done" || job.status === "failed";

  const mDelete = useMutation({
    mutationFn: () => deleteJob(job.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      // 현재 페이지가 해당 job detail일 수도 있으니 안전하게 history로
      // (목록 페이지에서는 영향 없음)
      // 원치 않으면 주석 처리 가능
      // nav("/app/history");
    },
  });

  const title = (job as any).title ? String((job as any).title) : "";
  const displayTitle = title.trim() ? title.trim() : job.id;

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
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {/* Title */}
        <div style={{ fontWeight: 1000, fontSize: 15, lineHeight: 1.2 }}>
          <Link
            to={`/app/jobs/${job.id}`}
            style={{
              color: "#111",
              textDecoration: "none",
              display: "inline-block",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              verticalAlign: "bottom",
            }}
            title={displayTitle}
          >
            {displayTitle}
          </Link>
        </div>

        {/* Subline: job id + pipeline */}
        <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
          id=<b style={{ color: "#444" }}>{job.id}</b> · type=<b style={{ color: "#444" }}>{job.pipelineType}</b>
        </div>

        <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
          {new Date(job.createdAt).toLocaleString()}
        </div>
      </div>

      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        <StatusBadge status={job.status} />

        {(job.status === "running" || job.status === "queued") && (
          <div style={{ fontSize: 12, color: "#555" }}>progress: {Math.round((job.progress ?? 0) * 100)}%</div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Link to={`/app/jobs/${job.id}`} style={ghostLink}>
            Open
          </Link>

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
              ...dangerBtn,
              opacity: !canDelete || mDelete.isPending ? 0.5 : 1,
              cursor: !canDelete || mDelete.isPending ? "not-allowed" : "pointer",
            }}
            title={!canDelete ? "Only done/failed jobs can be deleted (v1)." : "Delete job"}
          >
            {mDelete.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobItem["status"] }) {
  const bg =
    status === "done" ? "#e9f7ef" : status === "failed" ? "#fdecea" : status === "running" ? "#e8f0fe" : "#f2f2f2";
  const fg =
    status === "done" ? "#0f6b3e" : status === "failed" ? "#b42318" : status === "running" ? "#1a56db" : "#555";

  return (
    <span style={{ padding: "6px 10px", borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 900 }}>
      {status}
    </span>
  );
}

const ghostLink = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: 12,
  display: "inline-block",
} as const;

const dangerBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #f3c5c5",
  background: "#fff5f5",
  color: "#b42318",
  fontWeight: 1000,
  fontSize: 12,
} as const;