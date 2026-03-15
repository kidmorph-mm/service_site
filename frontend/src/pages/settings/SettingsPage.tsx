import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  resetApiBaseUrl,
  setApiBaseUrl,
} from "../../features/api/baseUrl";
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
  device?: string;
};

async function fetchHealth(baseUrl: string): Promise<Health> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return (await res.json()) as Health;
}

async function fetchConfig(baseUrl: string): Promise<Config> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/config`, { cache: "no-store" });
  if (!res.ok) throw new Error(`config failed: ${res.status}`);
  return (await res.json()) as Config;
}

function normalize(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

function isSameBase(a: string, b: string) {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

export default function SettingsPage() {
  const qc = useQueryClient();

  // ✅ 현재 적용 중(override 반영된) base
  const appliedBase = getApiBaseUrl();

  // 입력칸은 적용값으로 시작
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState<string>(appliedBase);
  const [pollMsInput, setPollMsInput] = useState<number>(getPollIntervalMs());

  const [savedMsg, setSavedMsg] = useState<string>("");
  const [testMsg, setTestMsg] = useState<string>("");

  const normalizedInput = useMemo(() => normalize(apiBaseUrlInput), [apiBaseUrlInput]);
  const hasOverride = useMemo(() => !isSameBase(appliedBase, DEFAULT_API_BASE_URL), [appliedBase]);

  // 입력값이 현재 적용값과 다른지(저장 필요 여부)
  const isDirty = useMemo(() => !isSameBase(normalizedInput, appliedBase) || pollMsInput !== getPollIntervalMs(), [normalizedInput, appliedBase, pollMsInput]);

  const qHealth = useQuery({
    queryKey: ["health", normalizedInput],
    queryFn: () => fetchHealth(normalizedInput),
    enabled: Boolean(normalizedInput),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const qConfig = useQuery({
    queryKey: ["config", normalizedInput],
    queryFn: () => fetchConfig(normalizedInput),
    enabled: Boolean(normalizedInput),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const serverStatus = useMemo(() => {
    if (!normalizedInput) return { label: "URL 없음", fg: "#b42318", bg: "#fff5f5", border: "#f3c5c5" };
    if (qHealth.isLoading) return { label: "확인 중…", fg: "#555", bg: "#fafafa", border: "#eee" };
    if (qHealth.isError) return { label: "연결 실패", fg: "#b42318", bg: "#fff5f5", border: "#f3c5c5" };
    if (qHealth.data?.ok) return { label: "연결됨", fg: "#0f6b3e", bg: "#e9f7ef", border: "#cdebd9" };
    return { label: "알 수 없음", fg: "#555", bg: "#fafafa", border: "#eee" };
  }, [normalizedInput, qHealth.isLoading, qHealth.isError, qHealth.data]);

  return (
    <div style={{ maxWidth: 980, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Settings</h1>
          <div style={{ color: "#555", lineHeight: 1.4 }}>
            배포/로컬 전환을 위해 <b>API Base URL</b>과 <b>폴링 간격</b>을 관리합니다.
          </div>
        </div>

        <span
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            border: `1px solid ${serverStatus.border}`,
            background: serverStatus.bg,
            color: serverStatus.fg,
            fontSize: 12,
            fontWeight: 1000,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
          title="현재 입력한 Base URL 기준 상태"
        >
          server: {serverStatus.label}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, marginTop: 14, alignItems: "start" }}>
        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="API Base URL">
            <Label>Base URL</Label>
            <Input value={apiBaseUrlInput} onChange={(v) => setApiBaseUrlInput(v)} placeholder="https://api.kidmorph.cloud" />

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={async () => {
                  setTestMsg("");
                  try {
                    const h = await fetchHealth(normalizedInput);
                    setTestMsg(`연결 성공 · ${new Date(h.time).toLocaleString()}`);
                  } catch {
                    setTestMsg("연결 실패: /health 응답을 확인하세요.");
                  }
                }}
                style={ghostBtn}
                disabled={!normalizedInput}
              >
                연결 테스트
              </button>

              <span style={hintInline}>
                적용 중: <b style={{ color: "#111" }}>{appliedBase}</b>
              </span>
            </div>

            {testMsg ? <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>{testMsg}</div> : null}

            <Hint>
              기본값은 <b>.env의 VITE_API_BASE_URL</b>입니다. 필요하면 여기서 저장해 <b>override</b>할 수 있습니다.
            </Hint>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>
                  env 기본값: <b style={{ color: "#111" }}>{DEFAULT_API_BASE_URL}</b>
                </div>

                {hasOverride ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetApiBaseUrl();
                      const next = DEFAULT_API_BASE_URL;
                      setApiBaseUrlInput(next);
                      setSavedMsg("override를 해제했습니다. (env 기본값으로 복귀)");
                      setTestMsg("");
                      qc.invalidateQueries();
                    }}
                    style={dangerGhostBtn}
                    title="localStorage override 제거"
                  >
                    Override 해제
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "#777", fontWeight: 900 }}>override 없음</span>
                )}
              </div>
            </div>
          </Card>

          <Card title="Polling (UI)">
            <Label>Polling Interval (ms)</Label>
            <Input
              value={String(pollMsInput)}
              onChange={(v) => setPollMsInput(Math.max(300, Number(v) || 1500))}
              placeholder="1500"
            />
            <Hint>
              Job 상태를 몇 ms마다 갱신할지입니다. (너무 낮으면 서버/브라우저 부하가 커집니다)
            </Hint>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <button type="button" onClick={() => setPollMsInput(800)} style={chipBtn}>800</button>
              <button type="button" onClick={() => setPollMsInput(1500)} style={chipBtn}>1500</button>
              <button type="button" onClick={() => setPollMsInput(3000)} style={chipBtn}>3000</button>
            </div>
          </Card>

          <Card title="Actions">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setSavedMsg("");
                  setTestMsg("");

                  // ✅ 저장(전역 적용)
                  setApiBaseUrl(apiBaseUrlInput);
                  setPollIntervalMs(pollMsInput);

                  // ✅ API base/poll 변경 시 캐시를 확실히 정리
                  qc.invalidateQueries();
                  setSavedMsg("저장되었습니다. (새 설정이 즉시 적용됩니다)");
                }}
                style={primaryBtn}
                disabled={!normalizedInput || !isDirty}
                title={!isDirty ? "변경 사항이 없습니다." : "저장 후 즉시 적용됩니다."}
              >
                Save
              </button>

              <button
                type="button"
                onClick={() => {
                  setSavedMsg("");
                  setTestMsg("");
                  // 입력값만 env 기본값으로 되돌림(override는 유지/해제 선택)
                  setApiBaseUrlInput(DEFAULT_API_BASE_URL);
                  setPollMsInput(1500);
                }}
                style={ghostBtn}
              >
                입력값 초기화
              </button>

              <span style={{ fontSize: 12, color: "#777", fontWeight: 900 }}>
                {isDirty ? "미저장 변경 있음" : "모두 최신"}
              </span>
            </div>

            {savedMsg ? <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>{savedMsg}</div> : null}

            <div style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
              저장은 localStorage 기반입니다. (v1) 운영 환경에서는 env 기본값(.env.production)을 권장합니다.
            </div>
          </Card>
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Server Info">
            <Row label="Health">
              {qHealth.isLoading ? "Loading..." : qHealth.isError ? "—" : qHealth.data?.ok ? "ok" : "—"}
            </Row>
            <Row label="Server time">
              {qHealth.isLoading ? "Loading..." : qHealth.isError ? "—" : new Date(qHealth.data!.time).toLocaleString()}
            </Row>

            <div style={{ marginTop: 10, borderTop: "1px dashed #ddd", paddingTop: 10 }}>
              <Row label="Version">{qConfig.isLoading ? "Loading..." : qConfig.data?.version ?? "—"}</Row>
              <Row label="Device">{qConfig.isLoading ? "Loading..." : qConfig.data?.device ?? "—"}</Row>
              <Row label="Jobs Dir">{qConfig.isLoading ? "Loading..." : qConfig.data?.dataDir ?? "—"}</Row>
              <Row label="Files mount">{qConfig.isLoading ? "Loading..." : qConfig.data?.filesMountPath ?? "—"}</Row>
            </div>

            <div style={{ marginTop: 10 }}>
              <Label>Allowed Pipelines</Label>
              <div style={readOnlyBox}>
                {qConfig.isLoading ? "Loading..." : (qConfig.data?.allowedPipelines ?? []).join(", ") || "—"}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <Label>Allowed Presets</Label>
              <div style={readOnlyBox}>
                {qConfig.isLoading ? "Loading..." : (qConfig.data?.allowedPresets ?? []).join(", ") || "—"}
              </div>
            </div>

            <Hint>
              이 정보는 <b>/health</b>, <b>/api/config</b> 응답에서 가져옵니다.
            </Hint>
          </Card>
        </div>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
      <span style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>{label}</span>
      <span style={{ fontSize: 12, color: "#111", fontWeight: 1000, textAlign: "right" }}>{children}</span>
    </div>
  );
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

const dangerGhostBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #f3c5c5",
  background: "#fff5f5",
  color: "#b42318",
  fontWeight: 1000,
  fontSize: 12,
  cursor: "pointer",
} as const;

const chipBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #eee",
  background: "#fff",
  color: "#111",
  fontWeight: 1000,
  fontSize: 12,
  cursor: "pointer",
} as const;