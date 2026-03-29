import type { JobQueue } from '../../adapters/queue/job-queue.interface'
import type { CreateTrainRequest } from '../../types/request'
import type { CreateJobResponse } from '../../types/response'

import { SingingError, SingingErrorCode } from '../../contracts/error'
import { createTrainJob } from '../use-cases/create-train-job'

/**
 * Application service coordinating voice training job lifecycle.
 */
export interface TrainingService {
  create: (request: CreateTrainRequest) => Promise<CreateJobResponse>
  getStatus: (jobId: string) => Promise<{ progress: number, epoch: number, totalEpochs: number, lossG?: number, lossD?: number }>
}

/**
 * Create a TrainingService with the given dependencies.
 */
export function createTrainingService(queue: JobQueue): TrainingService {
  return {
    create: request => createTrainJob(request, { queue }),
    getStatus: async (jobId) => {
      const job = await queue.getJob(jobId)
      if (!job) {
        throw new SingingError(SingingErrorCode.JobNotFound, `Training job ${jobId} not found`)
      }
      return {
        progress: job.trainingPct ?? 0,
        epoch: job.currentEpoch ?? 0,
        totalEpochs: job.totalEpochs ?? 0,
        lossG: job.lossG,
        lossD: job.lossD,
      }
    },
  }
}
