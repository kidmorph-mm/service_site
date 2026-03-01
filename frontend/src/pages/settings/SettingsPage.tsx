import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl, setApiBaseUrl } from "../../features/api/baseUrl";
import { getPollIntervalMs, setPollIntervalMs } from "../../features/appSettings";

type Health = { ok: boolean; time: string };
type Config = {
  ok: boolean;
  time: string;
  dataDir: string;
  allowedPipelines: string[];
  allowedPresets: string[];
  filesMountPath: string;
  version: string;
};

async function fetchHealth(baseUrl: string): Promise<Health> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`);
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return (await res.json()) as Health;
}

async function fetchConfig(baseUrl: string): Promise<Config> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/config`);
  if (!res.ok) throw new Error(`config failed: ${res.status}`);
  return (await res.json()) as Config;
}

export default function SettingsPage() {
  const qc = useQueryClient();

  // 초기값: localStorage 기반
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState<string>(getApiBaseUrl());
  const [pollMsInput, setPollMsInput] = useState<number>(getPollIntervalMs());

  const [savedMsg, setSavedMsg] = useState<string>("");
  const [testMsg, setTestMsg] = useState<string>("");

  const normalizedBase = useMemo(() => apiBaseUrlInput.trim().replace(/\/+$/, ""), [apiBaseUrlInput]);

  const qHealth = useQuery({
    queryKey: ["health", normalizedBase],
    queryFn: () => fetchHealth(normalizedBase),
    enabled: Boolean(normalizedBase),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const qConfig = useQuery({
    queryKey: ["config", normalizedBase],
    queryFn: () => fetchConfig(normalizedBase),
    enabled: Boolean(normalizedBase),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div style={{ maxWidth: 900, width: "100%", minWidth: 0 }}>
      <h1 style={{ marginBottom: 6 }}>Settings</h1>
      <div style={{ color: "#555" }}>서버 연결 및 폴링 등 핵심 설정만 관리합니다.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <Card title="API">
          <Label>API Base URL</Label>
          <Input value={apiBaseUrlInput} onChange={(v) => setApiBaseUrlInput(v)} placeholder="http://host:8000" />

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={async () => {
                setTestMsg("");
                try {
                  const h = await fetchHealth(normalizedBase);
                  setTestMsg(`연결 성공 · ${new Date(h.time).toLocaleString()}`);
                } catch (e) {
                  setTestMsg("연결 실패: /health 응답을 확인하세요.");
                }
              }}
              style={ghostBtn}
            >
              연결 테스트
            </button>

            <span style={hintInline}>
              현재 적용 값: <b style={{ color: "#111" }}>{getApiBaseUrl()}</b>
            </span>
          </div>

          {testMsg ? <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>{testMsg}</div> : null}

          <Hint>
            이 값은 프론트에서 API 호출 및 파일 링크(toAbsoluteUrl)에 사용됩니다.
          </Hint>
        </Card>

        <Card title="Server Info">
          <Label>Jobs Directory (server)</Label>
          <div style={readOnlyBox}>
            {qConfig.isLoading ? "Loading..." : qConfig.data?.dataDir ?? "—"}
          </div>

          <div style={{ marginTop: 10 }}>
            <Label>Allowed Pipelines</Label>
            <div style={readOnlyBox}>
              {qConfig.isLoading ? "Loading..." : (qConfig.data?.allowedPipelines ?? []).join(", ") || "—"}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <Label>Version</Label>
            <div style={readOnlyBox}>
              {qConfig.isLoading ? "Loading..." : qConfig.data?.version ?? "—"}
            </div>
          </div>

          <Hint>서버에서 제공하는 설정 정보입니다(읽기 전용).</Hint>
        </Card>

        <Card title="UI">
          <Label>Polling Interval (ms)</Label>
          <Input
            value={String(pollMsInput)}
            onChange={(v) => setPollMsInput(Math.max(300, Number(v) || 1500))}
            placeholder="1500"
          />
          <Hint>Job 상태를 몇 ms마다 갱신할지(페이지별 refetchInterval에 적용).</Hint>
        </Card>

        <Card title="Actions">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setSavedMsg("");

                // 저장(전역 적용)
                setApiBaseUrl(apiBaseUrlInput);
                setPollIntervalMs(pollMsInput);

                // 즉시 반영을 위해 캐시 invalidate (baseUrl이 바뀌면 새로 fetch)
                qc.invalidateQueries({ queryKey: ["jobs"] });
                qc.invalidateQueries({ queryKey: ["health"] });
                qc.invalidateQueries({ queryKey: ["config"] });

                setSavedMsg("저장되었습니다. (새 API Base URL / Polling 값 적용)");
              }}
              style={primaryBtn}
            >
              Save
            </button>

            <button
              type="button"
              onClick={() => {
                setSavedMsg("");
                setTestMsg("");
                setApiBaseUrlInput("http://192.168.0.28:8000");
                setPollMsInput(1500);
              }}
              style={ghostBtn}
            >
              Reset
            </button>
          </div>

          {savedMsg ? <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>{savedMsg}</div> : null}

          <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
            저장은 localStorage 기반입니다. (v1)
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

const readOnlyBox = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #eee",
  background: "#fafafa",
  color: "#444",
  fontWeight: 900,
  fontSize: 12,
  minHeight: 40,
  display: "flex",
  alignItems: "center",
} as const;

const hintInline = {
  fontSize: 12,
  color: "#777",
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
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