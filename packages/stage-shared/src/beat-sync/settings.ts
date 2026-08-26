import type { AnalyserWorkletParameters } from '@nekopaw/tempora'

import { DEFAULT_ANALYSER_WORKLET_PARAMS } from '@nekopaw/tempora'

export type { AnalyserWorkletParameters } from '@nekopaw/tempora'
export type BeatSyncSpectrumScale = 'linear' | 'logarithm'

export const DEFAULT_BEAT_SYNC_PARAMETERS: AnalyserWorkletParameters = {
  ...DEFAULT_ANALYSER_WORKLET_PARAMS,
  // Loosen the parameters for easier beat detection by default.
  // Also makes life easier :)
  warmup: false,
  spectralFlux: false,
  adaptiveThreshold: false,
}
