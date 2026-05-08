import type { AudioPath } from '../../domain/value-objects/audio-path'

/**
 * Common interface for all vocal/accompaniment separation backends.
 * Implementations: MelBand-RoFormer, BS-RoFormer, etc.
 */
export interface SeparatorBackend {
  readonly id: string
  separate: (input: AudioPath, outputDir: string, signal?: AbortSignal) => Promise<SeparationResult>
}

export interface SeparationResult {
  vocals: AudioPath
  instrumental: AudioPath
  /** Optional extra stems (drums, bass, etc.) for BS-RoFormer 6-stem mode */
  extraStems?: Record<string, AudioPath>
}
