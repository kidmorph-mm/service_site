export type TabItem = {
  key: string;
  label: string;
};

export default function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: value === it.key ? "#111" : "#fff",
            color: value === it.key ? "#fff" : "#111",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}