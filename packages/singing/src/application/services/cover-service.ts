import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CreateCoverRequest } from '../../types/request'
import type { CreateJobResponse, GetJobResponse } from '../../types/response'

import { cancelCoverJob } from '../use-cases/cancel-cover-job'
import { createCoverJob } from '../use-cases/create-cover-job'
import { getCoverJob } from '../use-cases/get-cover-job'
import { retryCoverJob } from '../use-cases/retry-cover-job'

/**
 * Application service coordinating cover job lifecycle.
 */
export interface CoverService {
  create: (request: CreateCoverRequest) => Promise<CreateJobResponse>
  get: (jobId: string) => Promise<GetJobResponse>
  cancel: (jobId: string) => Promise<{ cancelled: boolean }>
  retry: (jobId: string) => Promise<CreateJobResponse>
}

/**
 * Create a CoverService with the given dependencies.
 */
export function createCoverService(queue: JobQueue): CoverService {
  return {
    create: request => createCoverJob(request, { queue }),
    get: jobId => getCoverJob(jobId, { queue }),
    cancel: jobId => cancelCoverJob(jobId, { queue }),
    retry: jobId => retryCoverJob(jobId, { queue }),
  }
}
