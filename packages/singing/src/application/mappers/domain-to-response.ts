import type { CoverTask } from '../../domain/entities/cover-task'
import type { GetJobResponse } from '../../types/response'

/**
 * Maps a domain CoverTask entity to an HTTP response.
 */
export function mapCoverTaskToResponse(
  task: CoverTask,
): GetJobResponse {
  return {
    job: {
      id: task.id,
      status: task.status,
      currentStage: task.currentStage,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      error: task.error,
    },
  }
}
