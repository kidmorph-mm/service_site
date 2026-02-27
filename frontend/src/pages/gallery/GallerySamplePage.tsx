import { Link, useParams } from "react-router-dom";
import Viewer3D from "../../features/viewer/components/Viewer3D";

const sampleMap: Record<
  string,
  { title: string; desc: string; leftObj: string; rightObj: string }
> = {
  sample_01: {
    title: "SMPL-X → Child (basic)",
    desc: "원본과 변환 결과를 좌/우로 비교합니다. (OBJ 파일은 /public/models/ 에 추가해 바꿀 수 있습니다.)",
    leftObj: "/models/03_child.obj",
    rightObj: "/models/03_child.obj",
  },
  sample_02: {
    title: "Image → 3D (basic)",
    desc: "이미지 기반 3D 결과 예시. (현재는 뷰어 데모용 OBJ로 표시)",
    leftObj: "/models/03_child.obj",
    rightObj: "/models/03_child.obj",
  },
  sample_03: {
    title: "Hard case (occlusion)",
    desc: "어려운 케이스 예시. (현재는 뷰어 데모용 OBJ로 표시)",
    leftObj: "/models/03_child.obj",
    rightObj: "/models/03_child.obj",
  },
};

export default function GallerySamplePage() {
  const { sampleId } = useParams();
  const s = sampleId ? sampleMap[sampleId] : undefined;

  if (!sampleId || !s) {
    return (
      <div>
        <h1>Sample</h1>
        <div style={{ color: "#555" }}>Sample not found.</div>
        <div style={{ marginTop: 12 }}>
          <Link to="/app/gallery">← Back to Gallery</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{s.title}</h1>
          <div style={{ color: "#555", lineHeight: 1.4 }}>{s.desc}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => alert("mock: run sample")} style={primaryBtn}>
            Run Sample
          </button>
          <Link to="/app/new" style={ghostLink}>
            New Job →
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <div>
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>Original (Left)</div>
          <Viewer3D objUrl={s.leftObj} />
        </div>
        <div>
          <div style={{ fontWeight: 1000, marginBottom: 8 }}>Child (Right)</div>
          <Viewer3D objUrl={s.rightObj} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link to="/app/gallery">← Back to Gallery</Link>
      </div>
    </div>
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