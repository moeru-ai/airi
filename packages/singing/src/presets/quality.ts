import type { CreateCoverRequest } from '../types/request'

import { PresetId } from '../constants/presets'
import { COVER_PRESET_ANIME } from '../domain/presets/cover-anime'
import { COVER_PRESET_CLEAN } from '../domain/presets/cover-clean'
import { COVER_PRESET_DEFAULT } from '../domain/presets/cover-default'

type PartialCoverPreset = Omit<CreateCoverRequest, 'inputUri' | 'converter'>

/**
 * Quality presets mapped by PresetId.
 */
export const QUALITY_PRESETS: Record<string, PartialCoverPreset> = {
  [PresetId.Default]: COVER_PRESET_DEFAULT,
  [PresetId.Clean]: COVER_PRESET_CLEAN,
  [PresetId.Anime]: COVER_PRESET_ANIME,
}

/**
 * Get a quality preset by ID, falling back to default.
 */
export function getQualityPreset(id: string): PartialCoverPreset {
  return QUALITY_PRESETS[id] ?? COVER_PRESET_DEFAULT
}
