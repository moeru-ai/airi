/** A pinned Hugging Face model with the files required by its Sherpaw recognizer. */
export interface SherpawModel {
  /** Stable directory within the revision-scoped download cache. */
  id: string
  name: string
  repository: string
  revision: string
  languages: readonly string[]
  /** Selects the recognizer architecture, independently of the supported languages. */
  recognizer: 'paraformer' | 'transducer'
  /** Contains the published preload.data and preload.js.metadata pair. */
  directory: string
}

/** Quantized Chinese/English Paraformer distributed by Sherpaw. */
export const paraformerBilingualZhEn = {
  id: 'paraformer-zh-en',
  name: 'Paraformer — Chinese / English',
  revision: '46701cc733a82ed5cb94c7f3200a002d010243f6',
  repository: 'moeru-ai/sherpaw-paraformer-zh-en',
  languages: ['zh', 'en'],
  recognizer: 'paraformer',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

/** Chinese/English Zipformer distributed by Sherpaw. */
export const zipformerBilingualZhEn = {
  id: 'zipformer-zh-en',
  name: 'Zipformer — Chinese / English',
  revision: 'ede617607a6d1b3d6a74e3090501fc0b360ea289',
  repository: 'moeru-ai/sherpaw-zipformer-zh-en-2023-02-20',
  languages: ['zh', 'en'],
  recognizer: 'transducer',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

/** Eight-language Zipformer distributed by Sherpaw. */
export const zipformerMultilingual = {
  id: 'zipformer-multilingual',
  name: 'Zipformer — Arabic / English / Indonesian / Japanese / Russian / Thai / Vietnamese / Chinese',
  revision: 'fce043ac9738950d5cd223955b86656bfaa42311',
  repository: 'moeru-ai/sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10',
  languages: ['ar', 'en', 'id', 'ja', 'ru', 'th', 'vi', 'zh'],
  recognizer: 'transducer',
  directory: 'install/bin/wasm',
} as const satisfies SherpawModel

/** Returns the revision-scoped cache path for a model download. */
export function sherpawModelPath(model: SherpawModel) {
  return `sherpaw/${model.id}/${model.revision}`
}
