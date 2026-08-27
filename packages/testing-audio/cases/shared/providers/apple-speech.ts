import type { ProviderConfiguration } from '../configurations/provider'

/** Options for the Apple Speech Provider used by an Electron audio case. */
export interface AppleSpeechAsrOptions {
  /** @default 'en-US' */
  locale?: string
}

/** Creates the macOS Apple Speech Provider configuration for one Electron case. */
export function appleSpeechAsr(options: AppleSpeechAsrOptions = {}): ProviderConfiguration {
  return {
    id: 'apple-speech-transcription',
    definitionId: 'apple-speech-transcription',
    model: 'apple-speech',
    config: {
      locale: options.locale ?? 'en-US',
    },
  }
}
