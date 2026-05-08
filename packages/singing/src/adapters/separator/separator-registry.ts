import type { SeparatorBackend } from './separator.interface'

import { SeparatorBackendId } from '../../constants/model-backends'
import { BSRoFormerAdapter } from './bs-roformer.adapter'
import { MelBandRoFormerAdapter } from './melband-roformer.adapter'

/**
 * Registry of available separator backends.
 */
export function createSeparator(backend: SeparatorBackendId, model?: string): SeparatorBackend {
  switch (backend) {
    case SeparatorBackendId.MelBandRoFormer:
      return new MelBandRoFormerAdapter(model)
    case SeparatorBackendId.BSRoFormer:
      return new BSRoFormerAdapter(model)
    default:
      throw new Error(`Unknown separator backend: ${String(backend)}`)
  }
}
