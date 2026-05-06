import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CreateCoverRequest } from '../../types/request'
import type { CreateJobResponse } from '../../types/response'

import { randomUUID } from 'node:crypto'

import { validateCoverRequest } from '../../pipeline/guards/input-guard'

/**
 * Use case: create a new cover conversion job.
 */
export interface CreateCoverJobDeps {
  queue: JobQueue
  ownerId?: string
}

export async function createCoverJob(
  request: CreateCoverRequest,
  deps: CreateCoverJobDeps,
): Promise<CreateJobResponse> {
  validateCoverRequest(request)

  const jobId = randomUUID()
  const now = new Date().toISOString()

  await deps.queue.enqueue({
    id: jobId,
    ownerId: deps.ownerId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    payload: request,
  })

  return { jobId, status: 'pending' }
}
