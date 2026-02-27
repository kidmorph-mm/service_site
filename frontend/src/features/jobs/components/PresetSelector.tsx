import type { PresetId } from "../types";

export default function PresetSelector({
  value,
  onChange,
}: {
  value: PresetId;
  onChange: (v: PresetId) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <PresetButton id="fast" label="Fast" value={value} onChange={onChange} />
      <PresetButton id="balanced" label="Balanced" value={value} onChange={onChange} />
      <PresetButton id="quality" label="Quality" value={value} onChange={onChange} />
    </div>
  );
}

function PresetButton({
  id,
  label,
  value,
  onChange,
}: {
  id: PresetId;
  label: string;
  value: PresetId;
  onChange: (v: PresetId) => void;
}) {
  const active = value === id;
  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
        minWidth: 110,
      }}
    >
      {label}
    </button>
  );
}