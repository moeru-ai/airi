/**
 * TypeScript interfaces mirroring Python evaluation dataclasses.
 * Used by the pipeline orchestration and UI display layers.
 */

export interface BucketScore {
  bucket_tag: string
  singer_similarity: number
  content_score: number
  f0_corr: number
  naturalness_mos: number
  sample_count: number
}

export interface WorstSample {
  filename: string
  failure_reason: string
  score: number
}

export interface ReportCard {
  voice_id: string
  singer_similarity: number
  content_score: number
  f0_corr: number
  f0_rmse_cents: number
  st_accuracy: number
  vuv_error: number
  mcd: number
  loudness_rmse: number
  naturalness_mos: number
  per_bucket_scores: Record<string, BucketScore>
  worst_samples: WorstSample[]
  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface VoiceProfile {
  voice_id: string
  embedding_centroid: number[]
  f0_p10: number
  f0_p50: number
  f0_p90: number
  energy_mean: number
  energy_std: number
  dynamic_range_db: number
  unvoiced_ratio: number
  spectral_centroid: number
  spectral_flatness: number
  sample_count: number
}

export interface EvalResult {
  card: ReportCard
  passed: boolean
  failed_thresholds: string[]
}

export interface ValidationGateResult {
  passed: boolean
  singer_similarity: number
  f0_corr: number
  source_leakage: number
  tearing_risk: number
  failed_metrics: string[]
}
