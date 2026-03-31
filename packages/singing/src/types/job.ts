import type { PipelineStage } from '../constants/pipeline-stage'

/** Possible states of a singing job */
export type JobStatus
  = | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'

/** Core job record stored by the orchestrator */
export interface SingingJob {
  readonly id: string
  /** Authenticated user who owns the job, when applicable */
  ownerId?: string
  status: JobStatus
  /** Which pipeline stage is currently executing */
  currentStage?: PipelineStage
  /** ISO-8601 creation timestamp */
  createdAt: string
  /** ISO-8601 last update timestamp */
  updatedAt: string
  /** Error message if status is 'failed' */
  error?: string
  /** Original request payload for retry and persistence */
  payload?: unknown
  /** Per-stage timing in milliseconds */
  stageTiming?: Partial<Record<PipelineStage, number>>
  /** Training-specific progress (0-100) */
  trainingPct?: number
  /** Current training step number */
  trainingStep?: number
  /** Total training steps */
  trainingStepTotal?: number
  /** Human-readable name for current training step */
  trainingStepName?: string
  /** Number of retries performed (auto-calibration) */
  retryCount?: number
  /** Current GAN training epoch */
  currentEpoch?: number
  /** Total GAN training epochs */
  totalEpochs?: number
  /** Generator loss value */
  lossG?: number
  /** Discriminator loss value */
  lossD?: number
}
