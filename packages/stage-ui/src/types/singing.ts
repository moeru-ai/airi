import type { JobStatus, TrainingReportResponse as SingingTrainingReportCard } from '@proj-airi/singing/types'

/**
 * [singing] UI-side type re-exports and supplementary types.
 * Core types are defined in @proj-airi/singing/types and re-exported here.
 */

export type {
  CoverJobContract,
} from '@proj-airi/singing/contracts'

export type {
  GetJobResponse,
  JobStatus,
  Artifact as SingingArtifactRef,
  BaseModelInfo as SingingBaseModelInfo,
  SingingHealthResponse,
  SingingJob,
  SingingModelsResponse,
  TrainingReportResponse as SingingTrainingReportCard,
  VoiceModelInfo as SingingVoiceModelInfo,
} from '@proj-airi/singing/types'

/** Job status as displayed in the UI */
export type SingingJobDisplayStatus
  = | 'idle'
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'

/** UI form state for creating a cover job */
export interface CoverFormState {
  inputFile: File | null
  mode: 'rvc' | 'seedvc'
  voiceId: string
  referenceFile: File | null
  f0UpKey: number
  indexRate: number
  protect: number
  rmsMixRate: number
  vocalGainDb: number
  instGainDb: number
  ducking: boolean
  targetLufs: number
}

export const COVER_STAGE_PROGRESS_MAP: Record<string, number> = {
  prepare_source: 11,
  separate_vocals: 22,
  extract_f0: 33,
  auto_calibrate: 40,
  convert_vocals: 50,
  postprocess_vocals: 62,
  remix: 74,
  evaluate: 85,
  finalize: 95,
}

export function progressFromCoverStage(currentStage: string | null | undefined): number | null {
  if (!currentStage)
    return null

  return COVER_STAGE_PROGRESS_MAP[currentStage] ?? null
}

export function isTerminalSingingStatus(status: SingingJobDisplayStatus | JobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function getSingingElapsedSeconds(
  startedAt: number | null | undefined,
  updatedAt: number | null | undefined,
  status: SingingJobDisplayStatus | JobStatus,
  now = Date.now(),
): number {
  if (!startedAt)
    return 0

  const endAt = isTerminalSingingStatus(status)
    ? (updatedAt ?? startedAt)
    : now

  return Math.max(0, Math.round((endAt - startedAt) / 1000))
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value))
    return value

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed))
      return parsed
  }

  return fallback
}

export function normalizeSingingTrainingReportCard(input: unknown): SingingTrainingReportCard | null {
  if (!input || typeof input !== 'object')
    return null

  const raw = input as Record<string, unknown>
  const rawWorstSamples = Array.isArray(raw.worst_samples) ? raw.worst_samples : []
  const rawPerBucketScores = raw.per_bucket_scores
  const perBucketScores = typeof rawPerBucketScores === 'object' && rawPerBucketScores
    ? Object.fromEntries(
        Object.entries(rawPerBucketScores).map(([bucketTag, bucketScore]) => {
          const rawBucketScore = typeof bucketScore === 'object' && bucketScore
            ? bucketScore as Record<string, unknown>
            : {}

          return [
            bucketTag,
            {
              bucket_tag: typeof rawBucketScore.bucket_tag === 'string' && rawBucketScore.bucket_tag
                ? rawBucketScore.bucket_tag
                : bucketTag,
              singer_similarity: toFiniteNumber(rawBucketScore.singer_similarity),
              f0_corr: toFiniteNumber(rawBucketScore.f0_corr),
              naturalness_mos: toFiniteNumber(rawBucketScore.naturalness_mos),
            },
          ]
        }),
      )
    : {}

  return {
    overall_grade: typeof raw.overall_grade === 'string' && raw.overall_grade
      ? raw.overall_grade
      : 'N/A',
    singer_similarity: toFiniteNumber(raw.singer_similarity),
    content_score: toFiniteNumber(raw.content_score),
    f0_corr: toFiniteNumber(raw.f0_corr),
    naturalness_mos: toFiniteNumber(raw.naturalness_mos),
    f0_rmse_cents: toFiniteNumber(raw.f0_rmse_cents),
    mcd: toFiniteNumber(raw.mcd),
    worst_samples: rawWorstSamples.map((sample) => {
      const rawSample = typeof sample === 'object' && sample
        ? sample as Record<string, unknown>
        : {}

      return {
        filename: typeof rawSample.filename === 'string' ? rawSample.filename : '',
        failure_reason: typeof rawSample.failure_reason === 'string' && rawSample.failure_reason
          ? rawSample.failure_reason
          : 'Unknown issue',
        score: toFiniteNumber(rawSample.score),
      }
    }),
    per_bucket_scores: perBucketScores,
  }
}
