export type ArtifactItem = {
  id: string;
  label: string;
  kind: "model" | "image" | "text" | "report";
  url: string;
};

export function getMockArtifacts(jobId: string): ArtifactItem[] {
  // 지금 public/models에 있는 파일 위주로 연결
  if (jobId === "job_0001") {
    return [
      { id: "a1", label: "child mesh (OBJ)", kind: "model", url: "/models/03_child.obj" },
      { id: "a2", label: "adult mesh (OBJ)", kind: "model", url: "/models/04_adult.obj" },
    ];
  }
  return [
    { id: "b1", label: "child mesh (OBJ)", kind: "model", url: "/models/03_child.obj" },
  ];
}