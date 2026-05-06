/**
 * TypeScript interfaces for inference auto-calibration.
 * Maps to Python calibration module dataclasses.
 */

export interface SourceFeatures {
  f0_median: number
  f0_p10: number
  f0_p90: number
  speaker_embedding: number[] | null
  dynamic_range: number
  unvoiced_ratio: number
  sibilance_score: number
  spectral_flatness: number
  source_quality: number
}

export interface PredictedParams {
  pitch_shift: number
  pitch_confidence?: number
  index_rate: number
  filter_radius?: number
  protect: number
  rms_mix_rate: number
}

export interface CalibrationResult {
  params: PredictedParams
  source_features: SourceFeatures
  voice_profile_used: string
  auto_calibrated: boolean
}

export interface RetryAttempt {
  attempt: number
  params: PredictedParams
  gate_result: import('../evaluation/evaluation.types').ValidationGateResult
}
