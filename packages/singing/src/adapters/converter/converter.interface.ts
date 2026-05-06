import type { AudioPath } from '../../domain/value-objects/audio-path'

/**
 * Common interface for voice conversion backends (RVC, Seed-VC, etc.).
 */
export interface ConverterBackend {
  readonly id: string
  convert: (
    vocals: AudioPath,
    outputDir: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<ConversionResult>
}

export interface ConversionResult {
  convertedVocals: AudioPath
}
