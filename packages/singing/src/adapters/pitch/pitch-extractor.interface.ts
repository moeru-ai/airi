import type { AudioPath } from '../../domain/value-objects/audio-path'

/**
 * Common interface for pitch (F0) extraction backends.
 */
export interface PitchExtractorBackend {
  readonly id: string
  extract: (input: AudioPath, outputDir: string, signal?: AbortSignal) => Promise<PitchResult>
}

export interface PitchResult {
  /** Path to the F0 data file (e.g. f0.npy) */
  f0Path: string
  /** Detected key / average pitch if available */
  detectedKey?: string
}
