import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CreateTrainRequest } from '../../types/request'
import type { CreateJobResponse } from '../../types/response'

import { randomUUID } from 'node:crypto'

import { validateTrainRequest } from '../../pipeline/guards/input-guard'

/**
 * Use case: create a new RVC voice training job.
 */
export interface CreateTrainJobDeps {
  queue: JobQueue
  ownerId?: string
}

export async function createTrainJob(
  request: CreateTrainRequest,
  deps: CreateTrainJobDeps,
): Promise<CreateJobResponse> {
  validateTrainRequest(request)

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
