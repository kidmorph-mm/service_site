export default function FileDropzone({
  file,
  onPick,
  accept,
}: {
  file?: File;
  onPick: (f?: File) => void;
  accept?: string;
}) {
  return (
    <div
      style={{
        border: "2px dashed #bbb",
        borderRadius: 12,
        padding: 16,
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Input File</div>
          <div style={{ fontSize: 12, color: "#555" }}>
            {file ? `Selected: ${file.name}` : "Drop a file or click to select"}
          </div>
        </div>

        <label
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          Choose File
          <input
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </label>
      </div>

      {file && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => onPick(undefined)}
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: "8px 10px",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}