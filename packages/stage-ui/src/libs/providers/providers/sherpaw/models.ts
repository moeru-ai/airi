import { paraformerBilingualZhEn, zipformerBilingualZhEn, zipformerMultilingual } from '@proj-airi/vite-plugin-sherpaw/models'

/** Maps persisted model IDs to the presets bundled by AIRI applications. */
export const sherpawModels = {
  [paraformerBilingualZhEn.id]: paraformerBilingualZhEn,
  [zipformerBilingualZhEn.id]: zipformerBilingualZhEn,
  [zipformerMultilingual.id]: zipformerMultilingual,
} as const

/** Selects one architecture and language set, not a forced recognition language. */
export type SherpawModelId = keyof typeof sherpawModels
