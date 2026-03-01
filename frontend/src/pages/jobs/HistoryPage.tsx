import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import JobCard from "../../features/jobs/components/JobCard";
import { listJobs, type JobItem } from "../../features/jobs/backendApi";

type StatusFilter = "all" | "queued" | "running" | "done" | "failed";
type SortKey = "newest" | "oldest";

export default function HistoryPage() {
  const { data: jobs = [], isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: 1500,
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [deletableOnly, setDeletableOnly] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    let out = jobs.slice();

    if (status !== "all") {
      out = out.filter((j) => j.status === status);
    }

    if (deletableOnly) {
      out = out.filter((j) => j.status === "done" || j.status === "failed");
    }

    if (qq) {
      out = out.filter((j) => {
        const title = ((j as any).title ?? "") as string;
        return j.id.toLowerCase().includes(qq) || title.toLowerCase().includes(qq);
      });
    }

    out.sort((a, b) => {
      const aa = a.createdAt ?? "";
      const bb = b.createdAt ?? "";
      return sort === "newest" ? (aa < bb ? 1 : -1) : (aa < bb ? -1 : 1);
    });

    return out;
  }, [jobs, q, status, sort, deletableOnly]);

  const counts = useMemo(() => {
    const c = { all: jobs.length, queued: 0, running: 0, done: 0, failed: 0, deletable: 0 };
    for (const j of jobs) {
      (c as any)[j.status] = ((c as any)[j.status] ?? 0) + 1;
      if (j.status === "done" || j.status === "failed") c.deletable += 1;
    }
    return c;
  }, [jobs]);

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>History</h1>
          <div style={{ color: "#555", fontSize: 13 }}>
            총 <b>{counts.all}</b>개 · done <b>{counts.done}</b> · running <b>{counts.running}</b> · queued <b>{counts.queued}</b> · failed <b>{counts.failed}</b>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 14,
          background: "#fff",
          display: "grid",
          gridTemplateColumns: "1fr 180px 140px",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or jobId..."
          style={inputStyle}
        />

        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} style={selectStyle}>
          <option value="all">Status: all</option>
          <option value="queued">queued ({counts.queued})</option>
          <option value="running">running ({counts.running})</option>
          <option value="done">done ({counts.done})</option>
          <option value="failed">failed ({counts.failed})</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={selectStyle}>
          <option value="newest">Sort: newest</option>
          <option value="oldest">Sort: oldest</option>
        </select>

        <label style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#555", fontWeight: 900 }}>
          <input type="checkbox" checked={deletableOnly} onChange={(e) => setDeletableOnly(e.target.checked)} />
          Show deletable only (done/failed) · {counts.deletable} jobs
        </label>
      </div>

      {isLoading && <div style={{ marginTop: 12, color: "#666" }}>Loading...</div>}
      {error && <div style={{ marginTop: 12, color: "#b42318" }}>Failed to load jobs.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No jobs found.</div>
        ) : (
          filtered.map((job: JobItem) => <JobCard key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 12,
  fontWeight: 800,
  minWidth: 0,
} as const;

const selectStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  minWidth: 0,
} as const;