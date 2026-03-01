import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import JobCard from "../../features/jobs/components/JobCard";
import { listJobs, type JobItem } from "../../features/jobs/backendApi";

export default function QueuePage() {
  const { data: jobs = [], isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: 1500,
  });

  const [q, setQ] = useState("");

  const queue = useMemo(() => {
    const qq = q.trim().toLowerCase();

    let out = jobs.filter((j) => j.status === "queued" || j.status === "running");

    if (qq) {
      out = out.filter((j) => {
        const title = ((j as any).title ?? "") as string;
        return j.id.toLowerCase().includes(qq) || title.toLowerCase().includes(qq);
      });
    }

    // running 먼저, 그 다음 queued
    out.sort((a, b) => {
      const rank = (x: JobItem) => (x.status === "running" ? 0 : 1);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      // progress 큰 것 먼저(진행 중이면 위로)
      const pa = a.progress ?? 0;
      const pb = b.progress ?? 0;
      if (pa !== pb) return pb - pa;

      // 최신순
      return (a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1;
    });

    return out;
  }, [jobs, q]);

  const stats = useMemo(() => {
    const queued = queue.filter((j) => j.status === "queued").length;
    const running = queue.filter((j) => j.status === "running").length;
    const avgProgress =
      running === 0 ? 0 : Math.round((queue.filter((j) => j.status === "running").reduce((s, j) => s + (j.progress ?? 0), 0) / running) * 100);
    return { queued, running, avgProgress };
  }, [queue]);

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Queue</h1>
          <p style={{ color: "#555", margin: 0 }}>진행 중(running) / 대기 중(queued) 작업을 모니터링합니다.</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={statPill}>
            running <b style={{ color: "#111" }}>{stats.running}</b>
          </div>
          <div style={statPill}>
            queued <b style={{ color: "#111" }}>{stats.queued}</b>
          </div>
          <div style={statPill}>
            avg progress <b style={{ color: "#111" }}>{stats.avgProgress}%</b>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or jobId..."
          style={inputStyle}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
          Tip: 진행 바는 <b>running</b> 상태에서만 표시됩니다.
        </div>
      </div>

      {isLoading && <div style={{ marginTop: 12, color: "#666" }}>Loading...</div>}
      {error && <div style={{ marginTop: 12, color: "#b42318" }}>Failed to load jobs.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {queue.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No queued/running jobs.</div>
        ) : (
          queue.map((job) => (
            <div key={job.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <JobCard job={job} />

              {/* ✅ Progress bar + stage label */}
              {job.status === "running" ? (
                <div style={{ padding: "0 6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#666" }}>
                    <span>
                      stage: <b style={{ color: "#111" }}>{job.message || "running"}</b>
                    </span>
                    <span>
                      {Math.round((job.progress ?? 0) * 100)}%
                    </span>
                  </div>
                  <ProgressBar value={job.progress ?? 0} />
                </div>
              ) : (
                <div style={{ padding: "0 6px", fontSize: 12, color: "#777" }}>waiting…</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      style={{
        marginTop: 6,
        height: 10,
        borderRadius: 999,
        background: "#f2f2f2",
        border: "1px solid #eee",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: "#111",
          borderRadius: 999,
          transition: "width 160ms ease",
        }}
      />
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 12,
  fontWeight: 800,
  minWidth: 0,
} as const;

const statPill = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid #eee",
  background: "#fff",
  fontSize: 12,
  fontWeight: 900,
  color: "#555",
} as const;