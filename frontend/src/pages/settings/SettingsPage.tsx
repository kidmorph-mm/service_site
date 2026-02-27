import { useState } from "react";

export default function SettingsPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("http://192.168.0.28:8000");
  const [jobsDir, setJobsDir] = useState<string>("/data/jobs");
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(1500);

  return (
    <div style={{ maxWidth: 900, width: "100%", minWidth: 0 }}>
      <h1 style={{ marginBottom: 6 }}>Settings</h1>
      <div style={{ color: "#555" }}>서버 연결/폴링 등 최소 핵심 설정만 관리합니다.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <Card title="API">
          <Label>API Base URL</Label>
          <Input value={apiBaseUrl} onChange={(v) => setApiBaseUrl(v)} placeholder="http://host:8000" />
          <Hint>나중에 FastAPI 붙이면 이 값을 기준으로 API 호출합니다.</Hint>
        </Card>

        <Card title="Jobs Storage">
          <Label>Jobs Directory</Label>
          <Input value={jobsDir} onChange={(v) => setJobsDir(v)} placeholder="/data/jobs" />
          <Hint>서버에서 산출물이 저장되는 기본 경로(참고용).</Hint>
        </Card>

        <Card title="UI">
          <Label>Polling Interval (ms)</Label>
          <Input
            value={String(pollIntervalMs)}
            onChange={(v) => setPollIntervalMs(Math.max(300, Number(v) || 1500))}
            placeholder="1500"
          />
          <Hint>Job 상태를 몇 ms마다 갱신할지(초기에는 폴링 기반).</Hint>
        </Card>

        <Card title="Actions">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => alert("mock: saved")} style={primaryBtn}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setApiBaseUrl("http://192.168.0.28:8000");
                setJobsDir("/data/jobs");
                setPollIntervalMs(1500);
              }}
              style={ghostBtn}
            >
              Reset
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
            지금은 mock 저장입니다. 나중에 localStorage 또는 백엔드 프로필 저장으로 연결합니다.
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
      <div style={{ fontWeight: 1000, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 900, color: "#666", marginBottom: 6 }}>{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 8, fontSize: 12, color: "#777", lineHeight: 1.4 }}>{children}</div>;
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #ddd",
        outline: "none",
        fontWeight: 800,
      }}
    />
  );
}

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