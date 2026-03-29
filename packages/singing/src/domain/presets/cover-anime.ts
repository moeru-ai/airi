import type { CreateCoverRequest } from '../../types/request'

import { DEFAULT_MELBAND_MODEL, PitchBackendId, SeparatorBackendId } from '../../constants/model-backends'

/**
 * Anime/ACG cover preset: tuned for anime-style vocals.
 * Uses higher index_rate for stronger character similarity.
 */
export const COVER_PRESET_ANIME: Omit<CreateCoverRequest, 'inputUri' | 'converter'> = {
  mode: 'rvc',
  separator: {
    backend: SeparatorBackendId.MelBandRoFormer,
    model: DEFAULT_MELBAND_MODEL,
  },
  pitch: {
    backend: PitchBackendId.RMVPE,
  },
  mix: {
    vocalGainDb: 0.5,
    instGainDb: -2,
    ducking: true,
    targetLufs: -14,
    truePeakDb: -1.5,
  },
}
