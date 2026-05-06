import type { ConverterBackendId, PitchBackendId, SeparatorBackendId } from '../constants/model-backends'
import type { PipelineStage } from '../constants/pipeline-stage'

/**
 * Full audit trail for a completed cover job.
 * Persisted as manifest.json alongside artifacts.
 */
export interface CoverManifest {
  /** Schema version for forward compatibility */
  version: 1
  jobId: string
  createdAt: string
  completedAt: string

  input: {
    originalFileName: string
    sampleRate: number
    durationSeconds: number
  }

  separator: {
    backend: SeparatorBackendId
    model: string
    leadIsolation: boolean
  }

  pitch: {
    backend: PitchBackendId
  }

  converter: {
    backend: ConverterBackendId
    model: string
    params: Record<string, unknown>
  }

  mix: {
    vocalGainDb: number
    instGainDb: number
    ducking: boolean
    targetLufs: number
    truePeakDb: number
    /** Tracks that participated in the final mix */
    tracks?: Array<{ role: string, gain: number, label: string }>
  }

  /** Per-stage timing in milliseconds */
  timing: Partial<Record<PipelineStage, number>>

  /** SHA-256 checksums for produced artifact files */
  artifactHashes?: Record<string, string>

  /** Output sample rate */
  outputSampleRate: number

  /** Post-inference evaluation results (populated when autoCalibrate is enabled) */
  evaluation?: {
    singer_similarity: number
    f0_corr: number
    source_leakage: number
    tearing_risk: number
    passed: boolean
    failed_metrics: string[]
    auto_calibrated: boolean
    params_used: {
      pitch_shift: number
      index_rate: number
      protect: number
      rms_mix_rate: number
    }
  }
}
