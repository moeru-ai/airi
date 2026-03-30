import type { JobStatus } from '@proj-airi/singing/types'

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
