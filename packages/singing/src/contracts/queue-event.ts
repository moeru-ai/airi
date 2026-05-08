import type { PipelineStage } from '../constants/pipeline-stage'
import type { JobStatus } from '../types/job'

/**
 * Events emitted by the job queue for real-time status updates.
 * Consumed by SSE / WebSocket listeners in the server layer.
 */
export type QueueEvent
  = | QueueEventJobCreated
    | QueueEventStageStarted
    | QueueEventStageCompleted
    | QueueEventJobCompleted
    | QueueEventJobFailed

export interface QueueEventJobCreated {
  type: 'job:created'
  jobId: string
  timestamp: string
}

export interface QueueEventStageStarted {
  type: 'stage:started'
  jobId: string
  stage: PipelineStage
  timestamp: string
}

export interface QueueEventStageCompleted {
  type: 'stage:completed'
  jobId: string
  stage: PipelineStage
  durationMs: number
  timestamp: string
}

export interface QueueEventJobCompleted {
  type: 'job:completed'
  jobId: string
  status: Extract<JobStatus, 'completed'>
  timestamp: string
}

export interface QueueEventJobFailed {
  type: 'job:failed'
  jobId: string
  status: Extract<JobStatus, 'failed'>
  error: string
  timestamp: string
}
