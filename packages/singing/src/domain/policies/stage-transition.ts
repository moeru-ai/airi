import type { PipelineStage } from '../../constants/pipeline-stage'
import type { JobStatus } from '../../types/job'

/**
 * Policy: determines valid stage transitions.
 * Prevents skipping stages or going backwards.
 */
export function isValidStageTransition(
  current: PipelineStage | undefined,
  next: PipelineStage,
  stages: readonly PipelineStage[],
): boolean {
  if (current === undefined) {
    return next === stages[0]
  }
  const currentIdx = stages.indexOf(current)
  const nextIdx = stages.indexOf(next)
  return nextIdx === currentIdx + 1
}

/**
 * Policy: determines if a job status allows stage execution.
 */
export function canExecuteStage(status: JobStatus): boolean {
  return status === 'pending' || status === 'running'
}
