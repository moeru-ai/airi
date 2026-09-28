/** A pinned Sherpaw model and the artifacts required by its recognizer. */
export interface SherpawModel {
  /** Stable ID used by persisted provider configuration and asset storage. */
  id: string
  /** Recognizer family. Supported languages are rendered separately. */
  name: string
  repository: string
  revision: string
  supportedLanguages: readonly string[]
  /** Selects the recognizer architecture, independently of the supported languages. */
  recognizer: 'paraformer' | 'transducer'
  /** Token segmentation passed to the recognizer. Sherpaw's X-ASR setup uses an empty value. */
  modelingUnit: 'cjkchar' | ''
  /** Contains the published preload.data and preload.js.metadata pair. */
  directory: string
}

/** Quantized Chinese and English Paraformer distributed by Sherpaw. */
export const paraformerBilingualZhEn = {
  id: 'paraformer-zh-en',
  name: 'Paraformer',
  revision: '46701cc733a82ed5cb94c7f3200a002d010243f6',
  repository: 'moeru-ai/sherpaw-paraformer-zh-en',
  supportedLanguages: ['zh', 'en'],
  recognizer: 'paraformer',
  modelingUnit: 'cjkchar',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

/** Quantized Chinese and English X-ASR distributed by Sherpaw. */
export const xAsrBilingualZhEnInt8 = {
  id: 'x-asr-zh-en-480ms-int8',
  name: 'X-ASR 480 ms (INT8)',
  revision: 'd9ab70a45493b97ae76e08574fcbc5ad0c5d0039',
  repository: 'moeru-ai/sherpaw-x-asr-zh-en-480ms-int8',
  supportedLanguages: ['zh', 'en'],
  recognizer: 'transducer',
  modelingUnit: '',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

/** Eight-language Zipformer distributed by Sherpaw. */
export const zipformerMultilingual = {
  id: 'zipformer-multilingual',
  name: 'Zipformer',
  revision: 'fce043ac9738950d5cd223955b86656bfaa42311',
  repository: 'moeru-ai/sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10',
  supportedLanguages: ['ar', 'en', 'id', 'ja', 'ru', 'th', 'vi', 'zh'],
  recognizer: 'transducer',
  modelingUnit: 'cjkchar',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

export const sherpawModels = {
  [paraformerBilingualZhEn.id]: paraformerBilingualZhEn,
  [zipformerMultilingual.id]: zipformerMultilingual,
  [xAsrBilingualZhEnInt8.id]: xAsrBilingualZhEnInt8,
} as const

export type SherpawModelId = keyof typeof sherpawModels

/** Filters available models by one language. The all option keeps the full catalogue. */
export function sherpawModelsForLanguage(models: readonly SherpawModel[], language: string): SherpawModel[] {
  if (language === 'all')
    return [...models]
  return models.filter(model => model.supportedLanguages.includes(language))
}

/**
 * Selects a model from the host catalogue. Language changes retain the current
 * model when possible. For Chinese and English, new configurations prefer
 * X-ASR on desktop and Paraformer on mobile.
 */
export function selectSherpawModel(
  models: readonly SherpawModel[],
  language: string,
  options: { currentModelId?: string, isMobile?: boolean } = {},
): SherpawModel | undefined {
  const matchingModels = sherpawModelsForLanguage(models, language)
  if (options.currentModelId !== undefined)
    return matchingModels.find(model => model.id === options.currentModelId) ?? matchingModels[0]

  const preferredId = options.isMobile || !['zh', 'en'].includes(language)
    ? paraformerBilingualZhEn.id
    : xAsrBilingualZhEnInt8.id
  return matchingModels.find(model => model.id === preferredId)
    ?? matchingModels[0]
    ?? models[0]
}

/** Returns the revision-scoped cache path for a model download. */
export function sherpawModelPath(model: SherpawModel): string {
  return `sherpaw/${model.id}/${model.revision}`
}

/**
 * Returns a pinned Hugging Face URL for one model artifact.
 *
 * @example
 * sherpawModelArtifactUrl(paraformerBilingualZhEn, 'preload.data')
 * // => 'https://huggingface.co/moeru-ai/sherpaw-paraformer-zh-en/resolve/46701cc.../install/bin/wasm/preload.data'
 */
export function sherpawModelArtifactUrl(
  model: SherpawModel,
  filename: 'preload.data' | 'preload.js.metadata',
): string {
  return `https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.directory}/${filename}`
}

/**
 * Formats a model name with localized names for its supported languages.
 *
 * @example
 * formatSherpawModelName(paraformerBilingualZhEn, 'en')
 * // => 'Paraformer — Chinese, English'
 */
function languageDisplayNames(locale: string): Intl.DisplayNames {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' })
  }
  catch {
    return new Intl.DisplayNames(['en'], { type: 'language' })
  }
}

/** Returns one language name in the current interface locale. */
export function formatSherpawLanguageName(language: string, locale: string): string {
  try {
    return languageDisplayNames(locale).of(language) ?? language
  }
  catch {
    return language
  }
}

export function formatSherpawModelName(model: SherpawModel, locale: string): string {
  const displayNames = languageDisplayNames(locale)
  const languages = model.supportedLanguages.map((language) => {
    try {
      return displayNames.of(language) ?? language
    }
    catch {
      return language
    }
  })
  return `${model.name} — ${languages.join(', ')}`
}
