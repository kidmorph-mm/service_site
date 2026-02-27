import { Link } from "react-router-dom";
import { isInQueue, mockJobs } from "../../features/jobs/mock";
import JobCard from "../../features/jobs/components/JobCard";

export default function DashboardPage() {
  const queued = mockJobs.filter((j) => j.status === "queued").length;
  const running = mockJobs.filter((j) => j.status === "running").length;
  const failed = mockJobs.filter((j) => j.status === "failed").length;
  const done = mockJobs.filter((j) => j.status === "done").length;

  const queueTop = mockJobs.filter((j) => isInQueue(j.status)).slice(0, 3);
  const recent = mockJobs
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <Hero />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
        <Stat title="Queued" value={queued} />
        <Stat title="Running" value={running} />
        <Stat title="Done" value={done} />
        <Stat title="Failed" value={failed} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <Card
          title="Queue"
          right={
            <Link to="/app/queue" style={linkStyle}>
              View all →
            </Link>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {queueTop.length === 0 ? <Empty text="No queued/running jobs." /> : queueTop.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        </Card>

        <Card
          title="Recent Jobs"
          right={
            <Link to="/app/history" style={linkStyle}>
              View all →
            </Link>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recent.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="How it works">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <MiniStep title="1) Input" desc="Image or SMPL-X" />
            <MiniStep title="2) Process" desc="Seg / Depth / Skeleton" />
            <MiniStep title="3) Transform" desc="Adult → Child" />
            <MiniStep title="4) Export" desc="3D + Report" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 18,
        padding: 18,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 280 }}>
          <div style={{ fontWeight: 1000, fontSize: 20, letterSpacing: -0.2 }}>KidMorph Studio</div>
          <div style={{ marginTop: 8, color: "#444", lineHeight: 1.4 }}>
            Adult 데이터를 기반으로 <b>Child 형태로 변환</b>하거나, 입력으로부터 <b>3D 결과</b>를 생성하고
            <b> 과정/비교/리포트</b>까지 한 번에 관리하는 데모 웹입니다.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <LinkButton to="/app/new">New Job</LinkButton>
          <LinkButton to="/app/gallery">Gallery</LinkButton>
          <LinkButton to="/app/reports">Reports</LinkButton>
          <LinkButtonGhost to="/app/settings">Settings</LinkButtonGhost>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
        <FeatureCard title="Pipeline Visible" desc="중간 산출물(단계)을 확인" />
        <FeatureCard title="Before / After Compare" desc="좌/우 3D 비교로 결과 확인" />
        <FeatureCard title="Auto Report" desc="결과 요약 리포트 생성/관리" />
      </div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 1000, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fafafa" }}>
      <div style={{ fontWeight: 1000 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>{desc}</div>
    </div>
  );
}

function MiniStep({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, background: "#fafafa" }}>
      <div style={{ fontWeight: 1000 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>{desc}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: "#666", fontSize: 13 }}>{text}</div>;
}

function LinkButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#111",
        color: "#fff",
        textDecoration: "none",
        fontWeight: 1000,
        fontSize: 12,
      }}
    >
      {children}
    </Link>
  );
}

function LinkButtonGhost({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#fff",
        color: "#111",
        textDecoration: "none",
        fontWeight: 1000,
        fontSize: 12,
      }}
    >
      {children}
    </Link>
  );
}

const linkStyle = { fontSize: 12, fontWeight: 900, color: "#111", textDecoration: "none" } as const;