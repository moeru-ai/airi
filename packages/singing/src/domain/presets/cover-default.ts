import type { CreateCoverRequest } from '../../types/request'

import { DEFAULT_MELBAND_MODEL, PitchBackendId, SeparatorBackendId } from '../../constants/model-backends'

/**
 * Default cover preset: MelBand-RoFormer + RMVPE + RVC.
 * Balanced quality and speed for most songs.
 */
export const COVER_PRESET_DEFAULT: Omit<CreateCoverRequest, 'inputUri' | 'converter'> = {
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
    instGainDb: -1.5,
    ducking: true,
    targetLufs: -14,
    truePeakDb: -1.5,
  },
}
