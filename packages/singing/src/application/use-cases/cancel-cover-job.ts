import type { JobQueue } from '../../adapters/queue/job-queue.interface'

import { SingingError, SingingErrorCode } from '../../contracts/error'

/**
 * Use case: cancel a running or pending cover job.
 */
export interface CancelCoverJobDeps {
  queue: JobQueue
}

export async function cancelCoverJob(
  jobId: string,
  deps: CancelCoverJobDeps,
): Promise<{ cancelled: boolean }> {
  const job = await deps.queue.getJob(jobId)
  if (!job) {
    throw new SingingError(SingingErrorCode.JobNotFound, `Job ${jobId} not found`)
  }

  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
    return { cancelled: false }
  }

  await deps.queue.updateJob(jobId, {
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  })

  return { cancelled: true }
}
