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

export type BaseModelCategory = 'pitch' | 'encoder' | 'separation' | 'pretrained'

export interface BaseModelInfo {
  id: string
  name: string
  category: BaseModelCategory
  description: string
  exists: boolean
  sizeBytes: number
  actualSize: number
}

export interface VoiceModelInfo {
  name: string
  hasIndex: boolean
  grade?: string
}

export interface SingingModelsResponse extends ListVoicesResponse {
  voiceModels: VoiceModelInfo[]
  baseModels: BaseModelInfo[]
}

export interface SingingHealthResponse {
  status: 'ready' | 'models_needed' | 'setup_required' | 'degraded'
  setupSupported: boolean
  ffmpeg: boolean
  ffmpegPath: string | null
  python: boolean
  pythonPath: string | null
  pythonVenv: boolean
  pythonVenvExists: boolean
  pythonPackagesInstalled: boolean
  pythonPackagesMissing: string[]
  uvAvailable: boolean
  venvExists: boolean
  modelsDir: string | null
  singingPkgRoot: string | null
  moduleLoaded: boolean
  platform?: string
  arch?: string
  baseModels: BaseModelInfo[]
  baseModelsReady: boolean
}

export interface TrainingReportResponse {
  overall_grade: string
  singer_similarity: number
  content_score: number
  f0_corr: number
  naturalness_mos: number
  f0_rmse_cents: number
  mcd: number
  worst_samples: Array<{ filename: string, failure_reason: string, score: number }>
  per_bucket_scores: Record<string, {
    bucket_tag: string
    singer_similarity: number
    f0_corr: number
    naturalness_mos: number
  }>
}
