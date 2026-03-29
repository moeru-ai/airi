import type { PitchBackendId, SeparatorBackendId } from '../constants/model-backends'

/**
 * Request body for POST /jobs/cover
 */
export interface CreateCoverRequest {
  inputUri: string
  mode: 'rvc' | 'seedvc'
  /** Original filename from the user's upload (preserved for manifest) */
  originalFileName?: string
  separator: {
    backend: SeparatorBackendId
    model?: string
  }
  pitch: {
    backend: PitchBackendId
  }
  converter: CoverConverterParams
  mix?: MixParams
  /** When true (default), auto-calibrate parameters and run post-inference validation gate */
  autoCalibrate?: boolean
}

/** RVC converter parameters — field names aligned with RVC CLI/API */
export interface RvcConverterParams {
  backend: 'rvc'
  voiceId: string
  f0UpKey?: number
  indexRate?: number
  filterRadius?: number
  protect?: number
  rmsMixRate?: number
}

/** Seed-VC converter parameters — field names aligned with Seed-VC CLI */
export interface SeedVcConverterParams {
  backend: 'seedvc'
  referenceUri: string
  checkpoint?: string
  diffusionSteps?: number
  f0Condition?: boolean
  autoF0Adjust?: boolean
  semiToneShift?: number
}

export type CoverConverterParams = RvcConverterParams | SeedVcConverterParams

/** FFmpeg post-processing / remix parameters */
export interface MixParams {
  vocalGainDb?: number
  instGainDb?: number
  ducking?: boolean
  targetLufs?: number
  truePeakDb?: number
}

/**
 * Request body for POST /jobs/train-rvc-singer
 */
export interface CreateTrainRequest {
  voiceId: string
  datasetUri: string
  epochs?: number
  batchSize?: number
}
