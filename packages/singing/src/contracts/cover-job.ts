import type { PipelineStage } from '../constants/pipeline-stage'
import type { JobStatus } from '../types/job'
import type { CreateCoverRequest } from '../types/request'

/**
 * Contract for a cover job as seen by the server and UI layers.
 * This is the stable shape exchanged over HTTP / events.
 */
export interface CoverJobContract {
  id: string
  status: JobStatus
  request: CreateCoverRequest
  currentStage?: PipelineStage
  progress?: number
  createdAt: string
  updatedAt: string
  error?: string
  artifactBaseUrl?: string
}
