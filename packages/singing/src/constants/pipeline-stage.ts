/**
 * Ordered stages in the singing voice conversion pipeline.
 * Each stage reads upstream artifacts and writes its own output
 * without knowledge of other stages' implementation.
 */
export enum PipelineStage {
  PrepareSource = 'prepare_source',
  SeparateVocals = 'separate_vocals',
  ExtractF0 = 'extract_f0',
  AutoCalibrate = 'auto_calibrate',
  ConvertVocals = 'convert_vocals',
  PostprocessVocals = 'postprocess_vocals',
  Remix = 'remix',
  Evaluate = 'evaluate',
  Finalize = 'finalize',
}

/**
 * Default stage ordering for the main production pipeline.
 * MelBand-RoFormer -> RMVPE -> AutoCalibrate -> RVC -> FFmpeg -> Evaluate
 */
export const DEFAULT_STAGE_ORDER: readonly PipelineStage[] = [
  PipelineStage.PrepareSource,
  PipelineStage.SeparateVocals,
  PipelineStage.ExtractF0,
  PipelineStage.AutoCalibrate,
  PipelineStage.ConvertVocals,
  PipelineStage.PostprocessVocals,
  PipelineStage.Remix,
  PipelineStage.Evaluate,
  PipelineStage.Finalize,
] as const

/**
 * Legacy stage ordering without auto-calibration (for manual parameter mode).
 */
export const LEGACY_STAGE_ORDER: readonly PipelineStage[] = [
  PipelineStage.PrepareSource,
  PipelineStage.SeparateVocals,
  PipelineStage.ExtractF0,
  PipelineStage.ConvertVocals,
  PipelineStage.PostprocessVocals,
  PipelineStage.Remix,
  PipelineStage.Finalize,
] as const
