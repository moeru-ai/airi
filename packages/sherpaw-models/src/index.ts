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
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

/** Chinese and English Zipformer distributed by Sherpaw. */
export const zipformerBilingualZhEn = {
  id: 'zipformer-zh-en',
  name: 'Zipformer',
  revision: 'ede617607a6d1b3d6a74e3090501fc0b360ea289',
  repository: 'moeru-ai/sherpaw-zipformer-zh-en-2023-02-20',
  supportedLanguages: ['zh', 'en'],
  recognizer: 'transducer',
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
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

export const sherpawModels = {
  [paraformerBilingualZhEn.id]: paraformerBilingualZhEn,
  [zipformerBilingualZhEn.id]: zipformerBilingualZhEn,
  [zipformerMultilingual.id]: zipformerMultilingual,
} as const

export type SherpawModelId = keyof typeof sherpawModels

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
export function formatSherpawModelName(model: SherpawModel, locale: string): string {
  let displayNames: Intl.DisplayNames
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'language' })
  }
  catch {
    displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
  }
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
