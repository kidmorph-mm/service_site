import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import FileDropzone from "../../shared/components/common/FileDropzone";
import { createJob } from "../../features/jobs/backendApi";

type PipelineUI = "image_to_child" | "smplx_to_child";
function asPipelineUI(v: string | null): PipelineUI | null {
  if (v === "image_to_child" || v === "smplx_to_child") return v;
  return null;
}

export default function NewJobPage() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const [sp] = useSearchParams();
  const qpPipeline = asPipelineUI(sp.get("pipelineType"));
  const sampleId = sp.get("sampleId");

  const [title, setTitle] = useState<string>("");
  const [pipelineType, setPipelineType] = useState<PipelineUI>(qpPipeline ?? "image_to_child");
  const [inputFile, setInputFile] = useState<File | undefined>(undefined);

  useEffect(() => {
    if (qpPipeline) setPipelineType(qpPipeline);
  }, [qpPipeline]);

  const usingSample = Boolean(sampleId);
  useEffect(() => {
    if (usingSample) setInputFile(undefined);
  }, [usingSample]);

  // 파이프라인 바뀌면 기본 title이 비어있을 때만 추천값 세팅
  useEffect(() => {
    if (title.trim()) return;
    setTitle(pipelineType === "image_to_child" ? "Image → Child" : "SMPL-X → Child");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineType]);

  const helpText = useMemo(() => {
    if (pipelineType === "image_to_child") {
      return "이미지를 업로드하면 3D/SMPL-X를 복원한 뒤, 어린이 체형으로 변환까지 한 번에 수행합니다.";
    }
    return "SMPL-X 파일(pkl/npz)을 업로드하면 어린이 체형으로 변환합니다.";
  }, [pipelineType]);

  const accept = pipelineType === "image_to_child" ? "image/*" : ".pkl,.npz";
  const canRun = (title.trim().length > 0) && (usingSample || Boolean(inputFile));

  const mCreate = useMutation({
    mutationFn: createJob,
    onSuccess: async (job) => {
      await qc.invalidateQueries({ queryKey: ["jobs"] });
      nav(`/app/jobs/${job.id}`);
    },
  });

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ marginBottom: 6 }}>New Job</h1>
      <p style={{ color: "#555", margin: 0, lineHeight: 1.4 }}>{helpText}</p>

      <Section title="0) Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Chantal004 sample / occlusion case / run_01 ..."
          style={{
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontSize: 13,
            fontWeight: 800,
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
          화면에는 이 제목이 표시됩니다. (job_id는 내부 식별자)
        </div>
      </Section>

      {usingSample && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 14,
            border: "1px solid #eee",
            background: "#fafafa",
            color: "#444",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          Sample selected: <b>{sampleId}</b>. File upload is optional in this mode.
        </div>
      )}

      <Section title="1) Select pipeline">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PipelineCard
            title="Image → Child (end-to-end)"
            desc="Image input → 3D/SMPL-X → child transform"
            active={pipelineType === "image_to_child"}
            onClick={() => setPipelineType("image_to_child")}
          />
          <PipelineCard
            title="SMPL-X → Child"
            desc="SMPL-X input (pkl/npz) → child transform"
            active={pipelineType === "smplx_to_child"}
            onClick={() => setPipelineType("smplx_to_child")}
          />
        </div>
      </Section>

      <Section title="2) Upload input">
        <FileDropzone file={inputFile} onPick={setInputFile} accept={accept} />
        {usingSample && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
            Sample mode: you can run without uploading a file.
          </div>
        )}
      </Section>

      <Section title="3) Run">
        {mCreate.isError && (
          <div style={{ marginBottom: 10, color: "#b42318", fontSize: 13 }}>
            Failed to create job. Check backend is running and CORS/baseUrl.
          </div>
        )}

        <button
          type="button"
          disabled={!canRun || mCreate.isPending}
          onClick={() => {
            mCreate.mutate({
              title: title.trim(),
              pipelineType: pipelineType as any,
              presetId: "balanced" as any,
              sampleId: sampleId ?? null,
              file: inputFile,
            });
          }}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: !canRun || mCreate.isPending ? "#eee" : "#111",
            color: !canRun || mCreate.isPending ? "#888" : "#fff",
            cursor: !canRun || mCreate.isPending ? "not-allowed" : "pointer",
            minWidth: 160,
          }}
        >
          {mCreate.isPending ? "Creating..." : "Run Job"}
        </button>

        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          title=<b>{title.trim() || "none"}</b>, pipeline=<b>{pipelineType}</b>, file=<b>{inputFile ? inputFile.name : "none"}</b>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18, padding: 14, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function PipelineCard({
  title,
  desc,
  active,
  onClick,
}: {
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        width: 360,
        padding: 14,
        borderRadius: 14,
        border: active ? "2px solid #111" : "1px solid #ddd",
        background: "#fff",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#555" }}>{desc}</div>
    </button>
  );
}