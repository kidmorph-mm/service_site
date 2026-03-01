import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listJobs, type JobItem } from "../../features/jobs/backendApi";
import JobCard from "../../features/jobs/components/JobCard";

export default function DashboardPage() {
  const { data: jobs = [], isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: 1500,
  });

  const latest = useMemo(() => jobs[0] ?? null, [jobs]);
  const recent = useMemo(() => jobs.slice(0, 3), [jobs]);

  const statusLine = useMemo(() => {
    const running = jobs.filter((j) => j.status === "running").length;
    const queued = jobs.filter((j) => j.status === "queued").length;
    const done = jobs.filter((j) => j.status === "done").length;
    return { running, queued, done };
  }, [jobs]);

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      {/* Hero */}
      <div style={heroCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 280 }}>
            <div style={{ fontWeight: 1100, fontSize: 22, letterSpacing: -0.2 }}>KidMorph Studio</div>
            <div style={{ marginTop: 8, color: "#555", lineHeight: 1.45 }}>
              성인 데이터를 기반으로 <b>어린이 체형(Child)으로 변환</b>하고, 입력으로부터 <b>3D 결과</b>를 생성해
              <b> 비교·리포트</b>까지 한 곳에서 관리합니다.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link to="/app/new" style={primaryBtn}>
                새 작업 만들기
              </Link>

              {latest ? (
                <Link to={`/app/jobs/${latest.id}`} style={ghostBtn}>
                  최근 작업 이어하기 →
                </Link>
              ) : (
                <span style={{ ...ghostPill, opacity: 0.6 }}>최근 작업 없음</span>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
              running <b style={{ color: "#111" }}>{statusLine.running}</b> · queued{" "}
              <b style={{ color: "#111" }}>{statusLine.queued}</b> · done <b style={{ color: "#111" }}>{statusLine.done}</b>
            </div>
          </div>

          {/* Right: small highlight box */}
          <div style={miniCard}>
            <div style={{ fontWeight: 1000, marginBottom: 6 }}>핵심 기능</div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
              1) 이미지 → 3D/SMPL-X 복원<br />
              2) SMPL-X → Child 변환<br />
              3) 좌/우 3D 비교 뷰어<br />
              4) PDF/HTML 리포트 생성
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link to="/app/gallery" style={ghostSmallBtn}>갤러리</Link>
              <Link to="/app/reports" style={ghostSmallBtn}>리포트</Link>
              <Link to="/app/history" style={ghostSmallBtn}>히스토리</Link>
            </div>
          </div>
        </div>
      </div>

      {isLoading && <div style={{ marginTop: 12, color: "#666" }}>Loading...</div>}
      {error && <div style={{ marginTop: 12, color: "#b42318" }}>Failed to load jobs.</div>}

      {/* Flow cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
        <FlowCard
          title="입력 선택"
          desc="이미지(엔드투엔드) 또는 SMPL-X(pkl/npz)를 선택합니다."
          tag="New Job"
          to="/app/new"
        />
        <FlowCard
          title="3D 변환 & 비교"
          desc="결과 OBJ를 뷰어에서 단일/좌우 비교로 확인합니다."
          tag="Viewer"
          to={latest ? `/app/jobs/${latest.id}` : "/app/history"}
        />
        <FlowCard
          title="리포트 산출"
          desc="summary.json + HTML/PDF로 결과를 공유/제출용으로 정리합니다."
          tag="Reports"
          to="/app/reports"
        />
      </div>

      {/* Recent (minimal) */}
      <div style={{ marginTop: 12 }}>
        <SectionHeader title="최근 작업" right={<Link to="/app/history" style={linkStyle}>전체 보기 →</Link>} />
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {recent.length === 0 ? (
            <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff", color: "#666" }}>
              아직 작업이 없습니다. <Link to="/app/new" style={inlineLink}>새 작업 만들기</Link>로 시작하세요.
            </div>
          ) : (
            recent.map((j) => <JobCard key={j.id} job={j as JobItem} />)
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
      <div style={{ fontWeight: 1000 }}>{title}</div>
      {right}
    </div>
  );
}

function FlowCard({ title, desc, tag, to }: { title: string; desc: string; tag: string; to: string }) {
  return (
    <Link to={to} style={flowCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 1000, color: "#111" }}>{title}</div>
        <span style={tagPill}>{tag}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: "#555", lineHeight: 1.45 }}>{desc}</div>
      <div style={{ marginTop: 10, fontSize: 12, color: "#777", fontWeight: 900 }}>열기 →</div>
    </Link>
  );
}

/* styles */
const heroCard = {
  border: "1px solid #eee",
  borderRadius: 18,
  padding: 18,
  background: "#fff",
} as const;

const miniCard = {
  width: 320,
  maxWidth: "100%",
  border: "1px solid #eee",
  borderRadius: 16,
  padding: 14,
  background: "#fafafa",
} as const;

const primaryBtn = {
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

const ghostBtn = {
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

const ghostSmallBtn = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
  fontSize: 12,
  display: "inline-block",
} as const;

const ghostPill = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #eee",
  background: "#fafafa",
  color: "#666",
  fontWeight: 900,
  fontSize: 12,
  display: "inline-block",
} as const;

const flowCard = {
  border: "1px solid #eee",
  borderRadius: 16,
  padding: 14,
  background: "#fff",
  textDecoration: "none",
  display: "block",
  minWidth: 0,
} as const;

const tagPill = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #eee",
  background: "#fafafa",
  fontSize: 12,
  fontWeight: 900,
  color: "#555",
} as const;

const linkStyle = { fontSize: 12, fontWeight: 900, color: "#111", textDecoration: "none" } as const;

const inlineLink = { color: "#111", fontWeight: 900, textDecoration: "none" } as const;