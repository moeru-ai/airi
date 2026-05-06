import type { PipelineStage } from '../../constants/pipeline-stage'

/**
 * Policy: standard artifact file naming within a job directory.
 *
 * Layout:
 *   <jobDir>/
 *     01_prep/source.wav
 *     02_separate/vocals.wav, instrumental.wav
 *     03_pitch/f0.npy
 *     04_convert/converted_vocals.wav
 *     05_mix/final_cover.wav
 *     manifest.json
 */

const STAGE_PREFIX_MAP: Record<string, string> = {
  prepare_source: '01_prep',
  separate_vocals: '02_separate',
  isolate_lead_vocal: '02b_isolate',
  extract_f0: '03_pitch',
  convert_vocals: '04_convert',
  postprocess_vocals: '04_convert',
  remix: '05_mix',
  finalize: '',
}

/**
 * Get the subdirectory name for a given pipeline stage.
 */
export function getStageDir(stage: PipelineStage): string {
  return STAGE_PREFIX_MAP[stage] ?? stage
}

/**
 * Build an artifact path: <jobDir>/<stageDir>/<filename>
 */
export function buildArtifactPath(
  jobDir: string,
  stage: PipelineStage,
  filename: string,
): string {
  const stageDir = getStageDir(stage)
  if (!stageDir) {
    return `${jobDir}/${filename}`
  }
  return `${jobDir}/${stageDir}/${filename}`
}
