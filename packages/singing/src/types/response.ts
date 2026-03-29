import type { CoverArtifacts } from './artifact'
import type { SingingJob } from './job'

/**
 * Response for job creation endpoints.
 */
export interface CreateJobResponse {
  jobId: string
  status: SingingJob['status']
}

/**
 * Response for job status query.
 */
export interface GetJobResponse {
  job: SingingJob
  artifacts?: Partial<CoverArtifacts>
}

/**
 * Response for listing available voice models.
 */
export interface ListVoicesResponse {
  voices: VoiceInfo[]
}

export interface VoiceInfo {
  id: string
  name: string
  description?: string
  /** Whether this voice has a trained RVC model */
  hasRvcModel: boolean
}
