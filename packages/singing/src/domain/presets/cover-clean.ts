import type { CreateCoverRequest } from '../../types/request'

import { DEFAULT_MELBAND_MODEL, PitchBackendId, SeparatorBackendId } from '../../constants/model-backends'

/**
 * Clean cover preset: optimized for already-clean vocal input.
 * Less aggressive separation, higher protect value.
 */
export const COVER_PRESET_CLEAN: Omit<CreateCoverRequest, 'inputUri' | 'converter'> = {
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
    truePeakDb: -1,
  },
}
