import type { CreateCoverRequest } from '../types/request'

import { DEFAULT_MELBAND_MODEL, PitchBackendId, SeparatorBackendId } from '../constants/model-backends'

/**
 * Low-latency preset: trades quality for speed.
 * Uses smaller models and fewer diffusion steps.
 */
export const LOW_LATENCY_PRESET: Omit<CreateCoverRequest, 'inputUri' | 'converter'> = {
  mode: 'rvc',
  separator: {
    backend: SeparatorBackendId.MelBandRoFormer,
    model: DEFAULT_MELBAND_MODEL,
  },
  pitch: {
    backend: PitchBackendId.RMVPE,
  },
  mix: {
    vocalGainDb: 0,
    instGainDb: -1,
    ducking: false,
    targetLufs: -14,
    truePeakDb: -1.5,
  },
}
