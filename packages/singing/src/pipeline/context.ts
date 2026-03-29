import type { PipelineStage } from '../constants/pipeline-stage'
import type { CoverTask } from '../domain/entities/cover-task'
import type { Artifact } from '../types/artifact'

/**
 * Mutable context passed through each pipeline stage.
 * Accumulates artifacts and timing as stages complete.
 */
export interface PipelineContext {
  readonly task: CoverTask
  readonly jobDir: string
  artifacts: Map<string, Artifact>
  timing: Map<PipelineStage, number>
  /** Free-form metadata populated by stages (e.g. source duration) */
  metadata: Map<string, unknown>
  /** Abort signal for cancellation support */
  signal?: AbortSignal
}

/**
 * Create a fresh pipeline context for a cover task.
 */
export function createPipelineContext(
  task: CoverTask,
  jobDir: string,
  signal?: AbortSignal,
): PipelineContext {
  return {
    task,
    jobDir,
    artifacts: new Map(),
    timing: new Map(),
    metadata: new Map(),
    signal,
  }
}
