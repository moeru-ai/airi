import type { PipelineStage } from '../constants/pipeline-stage'
import type { Artifact } from '../types/artifact'

/**
 * Result produced by a single pipeline stage.
 * Used internally to pass artifacts between stages.
 */
export interface StageResult {
  stage: PipelineStage
  success: boolean
  durationMs: number
  artifacts: Artifact[]
  error?: string
}
