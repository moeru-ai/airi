import type { JobStatus } from '../types/job'
import type { CreateTrainRequest } from '../types/request'

/**
 * Contract for a training job as seen by external consumers.
 */
export interface TrainJobContract {
  id: string
  status: JobStatus
  request: CreateTrainRequest
  progress?: number
  currentEpoch?: number
  totalEpochs?: number
  createdAt: string
  updatedAt: string
  error?: string
}
