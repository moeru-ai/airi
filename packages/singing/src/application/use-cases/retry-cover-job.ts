import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CreateJobResponse } from '../../types/response'

import { randomUUID } from 'node:crypto'

import { SingingError, SingingErrorCode } from '../../contracts/error'

/**
 * Use case: retry a failed cover job by creating a new one with the same config.
 */
export interface RetryCoverJobDeps {
  queue: JobQueue
}

export async function retryCoverJob(
  jobId: string,
  deps: RetryCoverJobDeps,
): Promise<CreateJobResponse> {
  const job = await deps.queue.getJob(jobId)
  if (!job) {
    throw new SingingError(SingingErrorCode.JobNotFound, `Job ${jobId} not found`)
  }

  if (!job.payload) {
    throw new SingingError(
      SingingErrorCode.InvalidInput,
      `Job ${jobId} has no stored payload — cannot retry`,
    )
  }

  const newId = randomUUID()
  const now = new Date().toISOString()

  await deps.queue.enqueue({
    id: newId,
    ownerId: job.ownerId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    payload: job.payload,
  })

  return { jobId: newId, status: 'pending' }
}
