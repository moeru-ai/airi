import type { CoverTask } from '../../domain/entities/cover-task'
import type { CreateCoverRequest } from '../../types/request'

/**
 * Maps an incoming HTTP request to a domain CoverTask entity.
 */
export function mapRequestToCoverTask(
  id: string,
  request: CreateCoverRequest,
  outputDir: string,
): CoverTask {
  const now = new Date()
  return {
    id,
    status: 'pending',
    request,
    outputDir,
    createdAt: now,
    updatedAt: now,
  }
}
