import { Link } from "react-router-dom";

type Difficulty = "easy" | "medium" | "hard" | "limit";

type Sample = {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  desc: string;
};

const samples: Sample[] = [
  {
    id: "sample_01",
    title: "SMPL-X → Child (basic)",
    difficulty: "easy",
    tags: ["smplx_to_child", "demo"],
    desc: "기본 체형 변환 예시 (샘플).",
  },
  {
    id: "sample_02",
    title: "Image → 3D (basic)",
    difficulty: "medium",
    tags: ["image_to_3d", "demo"],
    desc: "이미지 기반 3D 생성 예시 (샘플).",
  },
  {
    id: "sample_03",
    title: "Hard case (occlusion)",
    difficulty: "hard",
    tags: ["edge", "occlusion"],
    desc: "가림/노이즈가 있는 케이스 (샘플).",
  },
];

export default function GalleryPage() {
  return (
    <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Gallery</h1>
          <div style={{ color: "#555" }}>발표/시연용 대표 샘플을 빠르게 확인하고 실행할 수 있습니다.</div>
        </div>

        <Link to="/app/new" style={primaryLink}>
          New Job →
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
        {samples.map((s) => (
          <SampleCard key={s.id} sample={s} />
        ))}
      </div>
    </div>
  );
}

function SampleCard({ sample }: { sample: Sample }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, background: "#fff", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 1000 }}>{sample.title}</div>
        <Badge difficulty={sample.difficulty} />
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: "#555", lineHeight: 1.4 }}>{sample.desc}</div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {sample.tags.map((t) => (
          <span key={t} style={tagStyle}>
            {t}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <Link to={`/app/gallery/${sample.id}`} style={ghostLink}>
          View
        </Link>
        <button type="button" onClick={() => alert("mock: run sample")} style={primaryBtn}>
          Run
        </button>
      </div>
    </div>
  );
}

function Badge({ difficulty }: { difficulty: Difficulty }) {
  const map: Record<Difficulty, { bg: string; fg: string; text: string }> = {
    easy: { bg: "#e9f7ef", fg: "#0f6b3e", text: "EASY" },
    medium: { bg: "#e8f0fe", fg: "#1a56db", text: "MED" },
    hard: { bg: "#fff4e5", fg: "#92400e", text: "HARD" },
    limit: { bg: "#fdecea", fg: "#b42318", text: "LIMIT" },
  };

  const s = map[difficulty];
  return <span style={{ padding: "6px 10px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 12, fontWeight: 1000 }}>{s.text}</span>;
}

const tagStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid #eee",
  background: "#fafafa",
  fontSize: 12,
  fontWeight: 800,
  color: "#555",
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