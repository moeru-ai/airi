import type { PipelineStage } from '../../constants/pipeline-stage'
import type { JobStatus } from '../../types/job'
import type { CreateCoverRequest } from '../../types/request'

/**
 * Domain entity representing a single cover conversion task.
 * Tracks lifecycle from creation through pipeline execution to completion.
 */
export interface CoverTask {
  readonly id: string
  status: JobStatus
  request: CreateCoverRequest
  currentStage?: PipelineStage
  outputDir: string
  createdAt: Date
  updatedAt: Date
  error?: string
}
