import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listJobs, type JobItem, type ArtifactItem } from "../../features/jobs/backendApi";
import { toAbsoluteUrl } from "../../features/api/baseUrl";

type Summary = {
  job_id: string;
  pipelineType: string;
  presetId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  runtime_s: number;
  steps?: Record<string, number>;
  metrics?: Record<string, number>;
};

type ReportGroup = {
  job: JobItem;
  pdf?: ArtifactItem;
  html?: ArtifactItem;
  summary?: ArtifactItem;
};

async function fetchSummary(url: string): Promise<Summary> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`summary fetch failed: ${res.status}`);
  return (await res.json()) as Summary;
}

function getJobTitle(job: JobItem): string {
  const t = ((job as any).title ?? "") as string;
  return t.trim() ? t.trim() : job.id;
}

export default function ReportsPage() {
  const [sp] = useSearchParams();
  const initialQuery = sp.get("jobId") ?? "";

  const [q, setQ] = useState<string>(initialQuery);
  const [onlyDone, setOnlyDone] = useState<boolean>(true);

  const { data: jobs = [], isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: 2000,
  });

  const groups = useMemo((): ReportGroup[] => {
    const out: ReportGroup[] = [];
    for (const job of jobs) {
      const arts = job.artifacts ?? [];
      const reports = arts.filter((a) => a.kind === "report");

      const pdf = reports.find((r) => r.label.toLowerCase().endsWith(".pdf"));
      const html = reports.find((r) => r.label.toLowerCase().endsWith(".html") || r.label.toLowerCase().endsWith(".htm"));
      const summary = reports.find((r) => r.label.toLowerCase() === "summary.json");

      if (!pdf && !html && !summary) continue;
      out.push({ job, pdf, html, summary });
    }

    out.sort((a, b) => (a.job.updatedAt < b.job.updatedAt ? 1 : -1));
    return out;
  }, [jobs]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return groups.filter((g) => {
      if (onlyDone && g.job.status !== "done") return false;
      if (!qq) return true;

      const title = getJobTitle(g.job).toLowerCase();
      const id = g.job.id.toLowerCase();
      const type = String(g.job.pipelineType ?? "").toLowerCase();

      return title.includes(qq) || id.includes(qq) || type.includes(qq);
    });
  }, [groups, q, onlyDone]);

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Reports</h1>
          <div style={{ color: "#555" }}>
            최종 산출물(Report + Summary)을 모아 <b>검수·공유·제출</b>하는 페이지입니다.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/app/new" style={primaryLink}>New Job →</Link>
          <Link to="/app/history" style={ghostLink}>History →</Link>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 220px", gap: 12, alignItems: "start" }}>
        <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by title / jobId / type..."
              style={inputStyle}
            />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#555", fontWeight: 900 }}>
              <input type="checkbox" checked={onlyDone} onChange={(e) => setOnlyDone(e.target.checked)} />
              done only
            </label>
          </div>

          {isLoading && <div style={{ marginTop: 12, color: "#666" }}>Loading...</div>}
          {error && <div style={{ marginTop: 12, color: "#b42318" }}>Failed to load jobs.</div>}

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 ? (
              <div style={{ color: "#666", fontSize: 13 }}>
                No report artifacts found. Run a job and check that report.html/pdf/summary.json are generated.
              </div>
            ) : (
              filtered.map((g) => <ReportJobRow key={g.job.id} g={g} />)
            )}
          </div>
        </div>

        <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Purpose</div>
          <div style={{ color: "#555", lineHeight: 1.5, fontSize: 13 }}>
            Reports는 Job의 “과정”이 아니라<br />
            <b>최종 제출물</b>을 모아 검수/공유하는 공간입니다.
            <div style={{ marginTop: 10 }}>
              - PDF/HTML: 공유/제출<br />
              - summary.json: 핵심 수치(비율/시간) 증빙
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportJobRow({ g }: { g: ReportGroup }) {
  const title = getJobTitle(g.job);
  const summaryUrl = g.summary ? toAbsoluteUrl(g.summary.url) : null;

  const { data: summary } = useQuery({
    queryKey: ["summary", g.job.id],
    enabled: Boolean(summaryUrl),
    queryFn: () => fetchSummary(summaryUrl as string),
    staleTime: 30_000,
  });

  const pdfUrl = g.pdf ? toAbsoluteUrl(g.pdf.url) : null;
  const htmlUrl = g.html ? toAbsoluteUrl(g.html.url) : null;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          {/* ✅ Title 우선 */}
          <div style={{ fontWeight: 1000, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={title}>
            {title} <span style={{ color: "#777", fontWeight: 900 }}>({g.job.pipelineType})</span>
          </div>

          {/* ✅ jobId는 보조로 */}
          <div style={{ marginTop: 4, fontSize: 12, color: "#777" }}>
            id=<b>{g.job.id}</b> · updated: {new Date(g.job.updatedAt).toLocaleString()} · status=<b>{g.job.status}</b> · progress=
            <b>{Math.round((g.job.progress ?? 0) * 100)}%</b>
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#555" }}>
            <MetricPill label="runtime" value={summary ? `${summary.runtime_s}s` : "—"} />
            <MetricPill label="height_ratio" value={summary?.metrics?.height_ratio != null ? String(summary.metrics.height_ratio) : "—"} />
            <MetricPill label="armΔ(cm)" value={summary?.metrics?.arm_cm_delta != null ? String(summary.metrics.arm_cm_delta) : "—"} />
          </div>
        </div>

        <span style={badgeStyle}>{g.job.status}</span>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noreferrer" style={primaryLinkBtn}>
            View PDF
          </a>
        ) : null}

        {htmlUrl ? (
          <a href={htmlUrl} target="_blank" rel="noreferrer" style={ghostLinkSmall}>
            View HTML
          </a>
        ) : null}

        {summaryUrl ? (
          <a href={summaryUrl} target="_blank" rel="noreferrer" style={ghostLinkSmall}>
            Summary JSON
          </a>
        ) : null}

        <button
          type="button"
          onClick={async () => {
            const link = pdfUrl ?? htmlUrl ?? summaryUrl;
            if (!link) return;
            try {
              await navigator.clipboard.writeText(link);
              alert("Copied link.");
            } catch {
              alert(link);
            }
          }}
          style={ghostBtn}
        >
          Copy link
        </button>

        <Link to={`/app/jobs/${g.job.id}`} style={ghostLinkSmall}>
          Job →
        </Link>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #eee",
        background: "#fafafa",
        fontWeight: 900,
      }}
    >
      {label}: <span style={{ color: "#111" }}>{value}</span>
    </span>
  );
}

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 12,
  fontWeight: 800,
  minWidth: 220,
} as const;

const badgeStyle = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #eee",
  background: "#fafafa",
  fontSize: 12,
  fontWeight: 900,
  color: "#555",
} as const;

const primaryLink = {
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

const primaryLinkBtn = {
  ...primaryLink,
} as const;

const ghostLink = {
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

const ghostLinkSmall = {
  ...ghostLink,
  padding: "10px 10px",
} as const;

const ghostBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 1000,
  fontSize: 12,
  cursor: "pointer",
} as const;