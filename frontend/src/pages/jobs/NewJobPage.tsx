import { useMemo, useState } from "react";
import PresetSelector from "../../features/jobs/components/PresetSelector";
import type { CreateJobDraft, PipelineType, PresetId } from "../../features/jobs/types";
import FileDropzone from "../../shared/components/common/FileDropzone";

export default function NewJobPage() {
  const [pipelineType, setPipelineType] = useState<PipelineType>("image_to_3d");
  const [presetId, setPresetId] = useState<PresetId>("balanced");
  const [inputFile, setInputFile] = useState<File | undefined>(undefined);

  const helpText = useMemo(() => {
    if (pipelineType === "image_to_3d") {
      return "Upload an image (jpg/png). We will run segmentation/depth/skeleton and reconstruct 3D.";
    }
    return "Upload a SMPL-X file (pkl/npz). We will transform the body to a child morphology.";
  }, [pipelineType]);

  const accept = pipelineType === "image_to_3d" ? "image/*" : ".pkl,.npz";

  const draft: CreateJobDraft = { pipelineType, presetId, inputFile };

  const canRun = Boolean(inputFile);

  return (
    <div style={{ maxWidth: 860 }}>
      <h1>New Job</h1>
      <p style={{ color: "#444" }}>{helpText}</p>

      <Section title="1) Select pipeline">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PipelineCard
            title="Image → 3D Reconstruction"
            desc="Image input, outputs mesh + intermediate artifacts."
            active={pipelineType === "image_to_3d"}
            onClick={() => setPipelineType("image_to_3d")}
          />
          <PipelineCard
            title="SMPL-X → Child Transform"
            desc="SMPL-X (pkl/npz) input, outputs child mesh/params."
            active={pipelineType === "smplx_to_child"}
            onClick={() => setPipelineType("smplx_to_child")}
          />
        </div>
      </Section>

      <Section title="2) Choose preset">
        <PresetSelector value={presetId} onChange={setPresetId} />
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          Fast = quickest, Quality = best output but slower.
        </div>
      </Section>

      <Section title="3) Upload input">
        <FileDropzone file={inputFile} onPick={setInputFile} accept={accept} />
      </Section>

      <Section title="4) Run">
        <button
          type="button"
          disabled={!canRun}
          onClick={() => {
            // 지금은 mock: 백엔드 붙이면 createJob API 호출로 교체
            console.log("CreateJobDraft:", draft);
            alert("Mock run! (Check console). Next: connect FastAPI createJob.");
          }}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: canRun ? "#111" : "#eee",
            color: canRun ? "#fff" : "#888",
            cursor: canRun ? "pointer" : "not-allowed",
            minWidth: 160,
          }}
        >
          Run Job
        </button>

        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          Current draft: pipeline=<b>{pipelineType}</b>, preset=<b>{presetId}</b>, file=<b>{inputFile ? inputFile.name : "none"}</b>
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