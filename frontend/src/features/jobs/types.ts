export type PipelineType = "image_to_3d" | "smplx_to_child";
export type PresetId = "fast" | "balanced" | "quality";

export interface CreateJobDraft {
  pipelineType: PipelineType;
  presetId: PresetId;
  inputFile?: File;
}