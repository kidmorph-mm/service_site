import { Link } from "react-router-dom";

type Report = {
  id: string;
  jobId: string;
  format: "html" | "pdf";
  createdAt: string;
};

const mockReports: Report[] = [
  { id: "rep_0001", jobId: "job_0001", format: "html", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() },
  { id: "rep_0002", jobId: "job_0001", format: "pdf", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString() },
  { id: "rep_0003", jobId: "job_0002", format: "html", createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString() },
];

export default function ReportsPage() {
  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Reports</h1>
          <div style={{ color: "#555" }}>작업 결과 리포트를 모아서 보고 다운로드할 수 있습니다.</div>
        </div>

        <Link to="/app/history" style={ghostLink}>
          Go to History →
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <Card title="Recent Reports">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mockReports
              .slice()
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((r) => (
                <ReportRow key={r.id} r={r} />
              ))}
          </div>
        </Card>

        <Card title="Tips">
          <div style={{ color: "#555", lineHeight: 1.5 }}>
            - 리포트 생성은 Job Detail의 <b>Reports</b> 탭에서 실행합니다.<br />
            - 이후 이 페이지에서 모아서 다운로드/관리합니다.
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/app/jobs/job_0001" style={primaryLink}>
              Open a Job Detail →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ReportRow({ r }: { r: Report }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 1000 }}>
          {r.id} <span style={{ color: "#777", fontWeight: 900 }}>({r.format.toUpperCase()})</span>
        </div>
        <span style={badgeStyle}>{r.jobId}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{new Date(r.createdAt).toLocaleString()}</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
        <button type="button" onClick={() => alert("mock: open/view")} style={ghostBtn}>
          View
        </button>
        <button type="button" onClick={() => alert("mock: download")} style={primaryBtn}>
          Download
        </button>
        <Link to={`/app/jobs/${r.jobId}`} style={ghostLinkSmall}>
          Job →
        </Link>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

const badgeStyle = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #eee",
  background: "#fafafa",
  fontSize: 12,
  fontWeight: 900,
  color: "#555",
} as const;

const primaryBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#111",
  color: "#fff",
  fontWeight: 1000,
  fontSize: 12,
  cursor: "pointer",
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