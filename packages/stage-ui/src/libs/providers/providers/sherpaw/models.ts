import { paraformerBilingualZhEn, zipformerMultilingual } from '@proj-airi/vite-plugin-sherpaw/models'

/** Maps persisted Hearing choices to the presets bundled by AIRI applications. */
export const sherpawModels = {
  'zh-en': paraformerBilingualZhEn,
  'multilingual': zipformerMultilingual,
} as const

/** Selects a model group, not a forced recognition language. */
export type SherpawLanguageGroup = keyof typeof sherpawModels
