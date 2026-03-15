import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Tabs from "../../shared/components/common/Tabs";
import Viewer3D from "../../features/viewer/components/Viewer3D";
import CompareViewer3D from "../../features/viewer/components/CompareViewer3D";

import { deleteJob, getJob, type ArtifactItem, type JobItem } from "../../features/jobs/backendApi";
import { toAbsoluteUrl } from "../../features/api/baseUrl";

type JobTabKey = "viewer" | "analysis" | "reports" | "logs" | "downloads";

type Summary = {
  job_id: string;
  title?: string;
  pipelineType: string;
  presetId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  runtime_s?: number;
  steps?: Record<string, number>;
  metrics?: Record<string, any>;
  ratios?: {
    adult?: Record<string, number | null>;
    child?: Record<string, number | null>;
    delta?: Record<string, number | null>;
  };
  notes?: string;
};

// kidify_meta.json(원본 메타)는 필드가 더 많지만, UI에 쓰는 핵심만 타입화
type KidifyMeta = {
  adult_h_canonical?: number;
  adult_h_posed?: number;
  target_kid_h?: number;
  child_h_canonical_raw?: number;
  child_h_canonical_final?: number;
  child_h_posed_final?: number;
  scale_final?: number;

  lengths_adult_canonical?: Record<string, number>;
  lengths_child_canonical_final?: Record<string, number>;
  "lengths_delta(child-adult)"?: Record<string, number>;

  ratios_adult_canonical?: Record<string, number>;
  ratios_child_canonical_final?: Record<string, number>;
  "ratios_delta(child-adult)"?: Record<string, number>;

  w_small?: number;
  w_mid?: number;
  w_peak?: number;
  w_tall?: number;

  in_pkl?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return (await res.json()) as T;
}

function findByLabel(arts: ArtifactItem[], labelLower: string) {
  return arts.find((a) => (a.label ?? "").toLowerCase() === labelLower) ?? null;
}


export default function JobDetailPage() {
  const { jobId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab] = useState<JobTabKey>("viewer");

  const { data: job, isLoading, error } = useQuery({
    queryKey: ["job", jobId],
    enabled: Boolean(jobId),
    queryFn: () => getJob(jobId as string),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => {
      if (q.state.status === "error") return false;
      const j = q.state.data as JobItem | undefined;
      if (!j) return 1000;
      return j.status === "done" || j.status === "failed" ? false : 1000;
    },
  });

  const mDelete = useMutation({
    mutationFn: () => deleteJob(jobId as string),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      await qc.invalidateQueries({ queryKey: ["job", jobId] });
      nav("/app/history");
    },
  });

  if (!jobId) return <h1>Job Detail</h1>;

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1100 }}>
        <h1>Job Detail</h1>
        <div style={{ color: "#666" }}>Loading...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div style={{ maxWidth: 1100 }}>
        <h1>Job Detail</h1>
        <div style={{ color: "#b42318" }}>Failed to load job.</div>
        <div style={{ marginTop: 12 }}>
          <Link to="/app/history">← Back to History</Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "viewer", label: "Viewer" },
    { key: "analysis", label: "Analysis" },
    { key: "reports", label: "Reports" },
    { key: "logs", label: "Logs" },
    { key: "downloads", label: "Downloads" },
  ];

  const artifacts = job.artifacts ?? [];

  // Viewer: model만
  const modelArtifacts = artifacts.filter((a) => a.kind === "model");

  // Reports tab: report만 보여주되, analysis는 전체 artifacts에서 찾도록(중요)
  const reportArtifacts = artifacts.filter((a) => a.kind === "report");
  const logArtifacts = artifacts.filter((a) => a.kind === "text");

  const title = ((job as any).title ?? "") as string;
  const displayTitle = title.trim() ? title.trim() : job.id;

  const canDelete = job.status === "done" || job.status === "failed";

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayTitle}
          </h1>
          <div style={{ color: "#444" }}>
            id=<b>{job.id}</b> · type=<b>{job.pipelineType}</b> · status=<b>{job.status}</b> · progress=
            <b>{Math.round((job.progress ?? 0) * 100)}%</b>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
            {new Date(job.createdAt).toLocaleString()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton label="Refresh" onClick={() => window.location.reload()} />

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
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #f3c5c5",
              background: "#fff5f5",
              color: "#b42318",
              cursor: !canDelete || mDelete.isPending ? "not-allowed" : "pointer",
              fontWeight: 1000,
              fontSize: 12,
              opacity: !canDelete || mDelete.isPending ? 0.5 : 1,
            }}
            title={!canDelete ? "Only done/failed jobs can be deleted (v1)." : "Delete job"}
          >
            {mDelete.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, marginTop: 14, minWidth: 0 }}>
        {/* Left */}
        <Panel title="Pipeline">
          <StepList />

          <div style={{ marginTop: 14, fontWeight: 900 }}>Artifacts</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {artifacts.length === 0 ? (
              <div style={{ color: "#666", fontSize: 13 }}>No artifacts yet.</div>
            ) : (
              artifacts.map((a) => (
                <a
                  key={a.id}
                  href={toAbsoluteUrl(a.url)}
                  target="_blank"
                  rel="noreferrer"
                  style={artifactLinkStyle}
                  title={toAbsoluteUrl(a.url)}
                >
                  {a.label} <span style={{ color: "#777", fontWeight: 700 }}>({a.kind})</span>
                </a>
              ))
            )}
          </div>
        </Panel>

        {/* Right */}
        <Panel title="Workspace">
          <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as JobTabKey)} />

          <div style={{ marginTop: 12 }}>
            {tab === "viewer" && <ViewerTab models={modelArtifacts} />}
            {tab === "analysis" && (
              <AnalysisTab
                artifacts={artifacts}
                jobUpdatedAt={job.updatedAt}
                pipelineType={job.pipelineType}
              />
            )}
            {tab === "reports" && <ReportsTab jobId={job.id} reports={reportArtifacts} jobUpdatedAt={job.updatedAt} />}
            {tab === "logs" && <LogsTab logs={logArtifacts} />}
            {tab === "downloads" && <DownloadsTab artifacts={artifacts} jobUpdatedAt={job.updatedAt} />}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link to="/app/history">← Back to History</Link>
      </div>
    </div>
  );
}

function ViewerTab({ models }: { models: ArtifactItem[] }) {
  const [viewMode, setViewMode] = useState<"single" | "compare">("compare");
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");

  useEffect(() => {
    if (models.length === 0) return;

    // 기본 선택: 왼쪽은 original/adult, 오른쪽은 child/converted를 우선으로 잡기
    const leftOk = !!leftId && models.some((m) => m.id === leftId);
    const rightOk = !!rightId && models.some((m) => m.id === rightId);

    const hay = (m: ArtifactItem) => `${m.label ?? ""} ${m.url ?? ""}`.toLowerCase();

    const original =
      models.find((m) => /\boriginal(\.obj)?\b/.test(hay(m)) || /\badult\b/.test(hay(m)) || /\binput\b/.test(hay(m))) ??
      null;

    const child =
      models.find((m) => /\bchild(\.obj)?\b/.test(hay(m)) || /\bconverted\b/.test(hay(m)) || /\bkid\b/.test(hay(m))) ??
      null;

    const preferredLeft = original ?? models[0];
    const preferredRight =
      child && child.id !== preferredLeft.id
        ? child
        : models.find((m) => m.id !== preferredLeft.id) ?? preferredLeft;

    if (!leftOk) setLeftId(preferredLeft.id);
    if (!rightOk) setRightId(preferredRight.id);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  const left = useMemo(() => models.find((m) => m.id === leftId) ?? null, [models, leftId]);
  const right = useMemo(() => models.find((m) => m.id === rightId) ?? null, [models, rightId]);

  const leftUrl = left ? toAbsoluteUrl(left.url) : "";
  const rightUrl = right ? toAbsoluteUrl(right.url) : "";

  if (models.length === 0) return <div style={{ color: "#666" }}>No model artifacts yet.</div>;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setViewMode("single")} style={pillStyle(viewMode === "single")}>
          Single
        </button>
        <button type="button" onClick={() => setViewMode("compare")} style={pillStyle(viewMode === "compare")}>
          Compare
        </button>
      </div>

      {viewMode === "single" ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Model</span>
            <select value={leftId} onChange={(e) => setLeftId(e.target.value)} style={selectStyle}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <Viewer3D objUrl={leftUrl} />

          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            loaded=<b>{left?.label}</b>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end", minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Original (Adult)</div>
              <select value={leftId} onChange={(e) => setLeftId(e.target.value)} style={selectStyleFull}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Converted (Child)</div>
              <select value={rightId} onChange={(e) => setRightId(e.target.value)} style={selectStyleFull}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10, minWidth: 0 }}>
            <CompareViewer3D leftObjUrl={leftUrl} rightObjUrl={rightUrl} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsTab({ jobId, reports, jobUpdatedAt }: { jobId: string; reports: ArtifactItem[]; jobUpdatedAt: string }) {
  const withV = (url: string) => `${toAbsoluteUrl(url)}?v=${encodeURIComponent(jobUpdatedAt)}`;

  const summary = reports.find((r) => r.label.toLowerCase() === "summary.json");
  const pdf = reports.find((r) => r.label.toLowerCase().endsWith(".pdf"));
  const html = reports.find((r) => r.label.toLowerCase().endsWith(".html") || r.label.toLowerCase().endsWith(".htm"));

  return (
    <div>
      <div style={{ color: "#555", fontSize: 13, lineHeight: 1.4 }}>
        이 탭은 <b>최종 산출물(리포트)</b>만 보여줍니다. (검수/공유/제출 용도)
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {pdf ? (
          <a href={withV(pdf.url)} target="_blank" rel="noreferrer" style={primaryLinkBtn}>
            Open PDF
          </a>
        ) : (
          <span style={{ ...ghostPill, opacity: 0.6 }}>PDF 없음</span>
        )}

        {html ? (
          <a href={withV(html.url)} target="_blank" rel="noreferrer" style={ghostLinkBtn}>
            Open HTML
          </a>
        ) : (
          <span style={{ ...ghostPill, opacity: 0.6 }}>HTML 없음</span>
        )}

        {summary ? (
          <a href={withV(summary.url)} target="_blank" rel="noreferrer" style={ghostLinkBtn}>
            Open summary.json
          </a>
        ) : (
          <span style={{ ...ghostPill, opacity: 0.6 }}>summary 없음</span>
        )}

        <Link to={`/app/reports?jobId=${jobId}`} style={ghostLinkBtn}>
          Open Reports page →
        </Link>
      </div>

      <div style={{ marginTop: 14 }}>
        <SmallPanel title="Report files">
          {reports.length === 0 ? (
            <div style={{ color: "#666", fontSize: 13 }}>No reports yet.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {reports.map((r) => (
                <li key={r.id}>
                  <a href={withV(r.url)} target="_blank" rel="noreferrer" style={{ color: "#111" }}>
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </SmallPanel>
      </div>
    </div>
  );
}

function LogsTab({ logs }: { logs: ArtifactItem[] }) {
  return (
    <div>
      <SmallPanel title="Logs">
        {logs.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No logs yet.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {logs.map((l) => (
              <li key={l.id}>
                <a href={toAbsoluteUrl(l.url)} target="_blank" rel="noreferrer" style={{ color: "#111" }}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </SmallPanel>
    </div>
  );
}

function DownloadsTab({ artifacts, jobUpdatedAt }: { artifacts: ArtifactItem[]; jobUpdatedAt: string }) {
  const withV = (url: string) => `${toAbsoluteUrl(url)}?v=${encodeURIComponent(jobUpdatedAt)}`;

  return (
    <div>
      <SmallPanel title="Downloads">
        {artifacts.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No artifacts.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {artifacts.map((a) => (
              <a key={a.id} href={withV(a.url)} target="_blank" rel="noreferrer" style={artifactLinkStyle}>
                {a.label} <span style={{ color: "#777", fontWeight: 700 }}>({a.kind})</span>
              </a>
            ))}
          </div>
        )}
      </SmallPanel>
    </div>
  );
}

/**
 * Analysis: summary.json + kidify_meta.json을 이용해
 * Adult→Child에서 어떤 점이 변했는지 가장 직관적으로 보여줌.
 *
 * 중요: summary/kidify_meta는 kind가 report로 고정되지 않을 수 있으니,
 * 전체 artifacts에서 label 기반으로 찾음.
 */
function AnalysisTab({
  artifacts,
  jobUpdatedAt,
  pipelineType,
}: {
  artifacts: ArtifactItem[];
  jobUpdatedAt: string;
  pipelineType: string;
}) {
  const withV = (url: string) => `${toAbsoluteUrl(url)}?v=${encodeURIComponent(jobUpdatedAt)}`;

  const summaryArt = findByLabel(artifacts, "summary.json");
  const kidifyMetaArt = findByLabel(artifacts, "kidify_meta.json");

  const summaryUrl = summaryArt ? withV(summaryArt.url) : null;
  const kidifyMetaUrl = kidifyMetaArt ? withV(kidifyMetaArt.url) : null;

  const qSummary = useQuery({
    queryKey: ["summary", summaryUrl],
    enabled: Boolean(summaryUrl),
    queryFn: () => fetchJson<Summary>(summaryUrl as string),
    staleTime: 10_000,
    retry: false,
  });

  const qMeta = useQuery({
    queryKey: ["kidify_meta", kidifyMetaUrl],
    enabled: Boolean(kidifyMetaUrl),
    queryFn: () => fetchJson<KidifyMeta>(kidifyMetaUrl as string),
    staleTime: 30_000,
    retry: false,
  });

  if (pipelineType !== "smplx_to_child") {
    return (
      <div style={{ color: "#555", fontSize: 13, lineHeight: 1.5 }}>
        이 파이프라인은 아직 Adult→Child 분석 지표가 연결되지 않았습니다.
        <div style={{ marginTop: 8, color: "#777" }}>
          현재 Analysis는 <b>smplx_to_child</b>에서 생성되는 summary.json/kidify_meta.json 기반으로 동작합니다.
        </div>
      </div>
    );
  }

  if (!summaryUrl) {
    return (
      <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
        summary.json이 없습니다.
        <div style={{ marginTop: 8, color: "#777" }}>
          job이 <b>done</b>이 된 뒤 생성됩니다.
        </div>
      </div>
    );
  }

  if (qSummary.isLoading) return <div style={{ color: "#666" }}>Loading summary...</div>;
  if (qSummary.isError || !qSummary.data) return <div style={{ color: "#b42318" }}>Failed to load summary.json</div>;

  const s = qSummary.data;
  const m = (s.metrics ?? {}) as Record<string, any>;

  const rA = s.ratios?.adult ?? {};
  const rC = s.ratios?.child ?? {};
  const rD = s.ratios?.delta ?? {};

  const meta = qMeta.data;
  const lenA = meta?.lengths_adult_canonical ?? null;
  const lenC = meta?.lengths_child_canonical_final ?? null;
  const lenD = (meta as any)?.["lengths_delta(child-adult)"] ?? null;

  const nf = (x: any, digits = 4) => (x == null || Number.isNaN(Number(x)) ? "—" : Number(x).toFixed(digits));
  const sf = (x: any, digits = 4) => {
    if (x == null || Number.isNaN(Number(x))) return "—";
    const v = Number(x);
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(digits)}`;
  };

  const topChanges = [
    {
      label: "키 비율 (child/adult)",
      value: m.height_ratio == null ? "—" : nf(m.height_ratio, 4),
      hint: "전체 키가 얼마나 줄었는지",
    },
    {
      label: "목표 키 (target)",
      value: m.target_kid_h == null ? "—" : nf(m.target_kid_h, 4),
      hint: "샘플링된 어린이 목표 키",
    },
    {
      label: "최종 스케일 (scale_final)",
      value: m.scale_final == null ? "—" : nf(m.scale_final, 6),
      hint: "포즈 유지 상태에서 적용된 스케일",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "#555", fontSize: 13, lineHeight: 1.4 }}>
        아래는 <b>Adult → Child 변환에서 실제로 바뀐 지표</b> 요약입니다.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {topChanges.map((x) => (
          <div key={x.label} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>{x.label}</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 1000, letterSpacing: -0.2 }}>{x.value}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>{x.hint}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SmallPanel title="키/스케일 변화 (Heights)">
          <MetricLine label="adult_h_canonical" value={nf(m.adult_h_canonical, 4)} />
          <MetricLine label="adult_h_posed" value={nf(m.adult_h_posed, 4)} />
          <MetricLine label="target_kid_h" value={nf(m.target_kid_h, 4)} />
          <MetricLine label="child_h_canonical_final" value={nf(m.child_h_canonical_final, 4)} />
          <MetricLine label="child_h_posed_final" value={nf(m.child_h_posed_final, 4)} />
          <MetricLine label="height_ratio (child/adult)" value={m.height_ratio == null ? "—" : nf(m.height_ratio, 4)} />
          <MetricLine label="scale_final" value={nf(m.scale_final, 6)} />

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #ddd" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Height-adaptive weights</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <MetricLine label="w_small" value={nf(m.w_small, 4)} />
              <MetricLine label="w_mid" value={nf(m.w_mid, 4)} />
              <MetricLine label="w_peak" value={nf(m.w_peak, 4)} />
              <MetricLine label="w_tall" value={nf(m.w_tall, 4)} />
            </div>
          </div>
        </SmallPanel>

        <SmallPanel title="비율 변화 (Ratio: Adult → Child)">
          <DiffRow name="head_over_torso" a={rA.head_over_torso} c={rC.head_over_torso} d={rD.head_over_torso} />
          <DiffRow name="shoulder_over_torso" a={rA.shoulder_over_torso} c={rC.shoulder_over_torso} d={rD.shoulder_over_torso} />
          <DiffRow name="leg_over_torso" a={rA.leg_over_torso} c={rC.leg_over_torso} d={rD.leg_over_torso} />
          <DiffRow name="shoulder_over_leg" a={rA.shoulder_over_leg} c={rC.shoulder_over_leg} d={rD.shoulder_over_leg} />
          <DiffRow name="arm_over_torso" a={rA.arm_over_torso} c={rC.arm_over_torso} d={rD.arm_over_torso} />

          <div style={{ marginTop: 10, fontSize: 12, color: "#777", lineHeight: 1.4 }}>
            A=Adult, C=Child, Δ=C-A
          </div>
        </SmallPanel>
      </div>

      <SmallPanel title="길이 변화 (Length: Adult → Child)">
        {!kidifyMetaUrl ? (
          <div style={{ color: "#777", fontSize: 13, lineHeight: 1.5 }}>
            kidify_meta.json이 없어서 길이(length) 변화는 표시할 수 없습니다.
            <div style={{ marginTop: 6, fontSize: 12 }}>
              (백엔드에서 kidify_meta.json을 artifact로 포함해 주세요)
            </div>
          </div>
        ) : qMeta.isLoading ? (
          <div style={{ color: "#666" }}>Loading kidify_meta...</div>
        ) : qMeta.isError || !meta || !lenA || !lenC || !lenD ? (
          <div style={{ color: "#777", fontSize: 13, lineHeight: 1.5 }}>
            kidify_meta.json은 있지만 lengths 필드가 부족합니다.
            <div style={{ marginTop: 6, fontSize: 12 }}>
              기대 키: lengths_adult_canonical / lengths_child_canonical_final / lengths_delta(child-adult)
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 8, padding: "6px 0", color: "#666", fontSize: 12, fontWeight: 900 }}>
              <div>metric</div>
              <div style={{ textAlign: "right" }}>Adult</div>
              <div style={{ textAlign: "right" }}>Child</div>
              <div style={{ textAlign: "right" }}>Δ</div>
            </div>

            {[
              { k: "head_len", label: "head_len" },
              { k: "torso_len", label: "torso_len" },
              { k: "leg_len", label: "leg_len" },
              { k: "arm_len", label: "arm_len" },
              { k: "shoulder_w", label: "shoulder_w" },
            ].map(({ k, label }) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 8, padding: "6px 0" }}>
                <div style={{ fontSize: 13, color: "#333", fontWeight: 900 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>{nf((lenA as any)[k], 4)}</div>
                <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>{nf((lenC as any)[k], 4)}</div>
                <div style={{ fontSize: 12, color: "#111", textAlign: "right", fontWeight: 1000 }}>{sf((lenD as any)[k], 4)}</div>
              </div>
            ))}

            <div style={{ marginTop: 10, fontSize: 12, color: "#777", lineHeight: 1.4 }}>
              길이(length)는 canonical 기준이라 포즈 영향이 덜해서, 변환 성격 설명에 좋습니다.
            </div>
          </div>
        )}
      </SmallPanel>

      <SmallPanel title="실행 정보 (Runtime/Steps)">
        <MetricLine label="runtime_s" value={s.runtime_s == null ? "—" : `${nf(s.runtime_s, 4)}s`} />
        <div style={{ marginTop: 8 }}>
          {s.steps && Object.keys(s.steps).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(s.steps).map(([k, v]) => (
                <MetricLine key={k} label={k} value={`${nf(v, 4)}s`} />
              ))}
            </div>
          ) : (
            <div style={{ color: "#777", fontSize: 12 }}>step 정보가 없습니다.</div>
          )}
        </div>
      </SmallPanel>
    </div>
  );

  function MetricLine({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
        <span style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>{label}</span>
        <span style={{ fontSize: 12, color: "#111", fontWeight: 1000 }}>{value}</span>
      </div>
    );
  }

  function DiffRow({ name, a, c, d }: { name: string; a: any; c: any; d: any }) {
    const fmt = (x: any) => (x == null || Number.isNaN(Number(x)) ? "—" : Number(x).toFixed(4));
    const dfm = (x: any) => {
      if (x == null || Number.isNaN(Number(x))) return "—";
      const v = Number(x);
      const sign = v > 0 ? "+" : "";
      return `${sign}${v.toFixed(4)}`;
    };

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 8, padding: "6px 0" }}>
        <div style={{ fontSize: 13, color: "#333", fontWeight: 900 }}>{name}</div>
        <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>{fmt(a)}</div>
        <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>{fmt(c)}</div>
        <div style={{ fontSize: 12, color: "#111", textAlign: "right", fontWeight: 1000 }}>{dfm(d)}</div>
      </div>
    );
  }
}

function StepList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <StepCard title="1) Preprocess" items={["Segmentation", "Depth", "Skeleton"]} />
      <StepCard title="2) Reconstruction / Fitting" items={["3D Mesh / SMPL-X fit"]} />
      <StepCard title="3) Transform" items={["Adult → Child morphology"]} />
      <StepCard title="4) Export" items={["Mesh / Params", "Preview", "Report"]} />
    </div>
  );
}

function StepCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#555", fontSize: 13 }}>
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#fff",
        color: "#111",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff", minWidth: 0 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function SmallPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function pillStyle(active: boolean) {
  return {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  } as const;
}

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111", 
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const selectStyleFull = {
  ...selectStyle,
  width: "100%",
} as const;

const primaryLinkBtn = {
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

const ghostLinkBtn = {
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

const ghostPill = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fafafa",
  color: "#666",
  fontWeight: 900,
  fontSize: 12,
  display: "inline-block",
} as const;

const artifactLinkStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #eee",
  background: "#fff",
  textDecoration: "none",
  color: "#111",
  fontSize: 13,
  fontWeight: 800,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "block",
} as const;