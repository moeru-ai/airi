import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CreateTrainRequest } from '../../types/request'
import type { CreateJobResponse } from '../../types/response'

import { randomUUID } from 'node:crypto'

/**
 * Use case: create a new RVC voice training job.
 */
export interface CreateTrainJobDeps {
  queue: JobQueue
}

export async function createTrainJob(
  request: CreateTrainRequest,
  deps: CreateTrainJobDeps,
): Promise<CreateJobResponse> {
  if (!request.voiceId || !request.datasetUri) {
    throw new Error('voiceId and datasetUri are required for training')
  }

  const jobId = randomUUID()
  const now = new Date().toISOString()

  await deps.queue.enqueue({
    id: jobId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    payload: request,
  })

  return { jobId, status: 'pending' }
}
