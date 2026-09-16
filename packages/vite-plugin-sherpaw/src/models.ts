/** A pinned Hugging Face model and its Sherpaw packaging layout. */
export interface SherpawModel {
  /** Stable output directory below the plugin-owned `sherpaw` directory. */
  id: string
  name: string
  repository: string
  revision: string
  languages: readonly string[]
  source: {
    /** Download an existing Sherpaw data and metadata pair. */
    format: 'prepacked'
    directory: string
  } | {
    /** Pack source files under the filenames expected by the recognizer. */
    format: 'files'
    files: readonly { source: string, filename: string }[]
  }
}

/** Quantized Chinese/English Paraformer, packed from the upstream ONNX files. */
export const paraformerBilingualZhEn = {
  id: 'zh-en',
  name: 'Chinese / English',
  revision: '8e40c43232a1c5c66c82111efc5820d3accca11b',
  repository: 'csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en',
  languages: ['zh', 'en'],
  source: {
    format: 'files',
    files: [
      { source: 'encoder.int8.onnx', filename: '/encoder.onnx' },
      { source: 'decoder.int8.onnx', filename: '/decoder.onnx' },
      { source: 'tokens.txt', filename: '/tokens.txt' },
    ],
  },
} as const satisfies SherpawModel

/** Eight-language Zipformer distributed as a Sherpaw data and metadata pair. */
export const zipformerMultilingual = {
  id: 'multilingual',
  name: 'Arabic / English / Indonesian / Japanese / Russian / Thai / Vietnamese / Chinese',
  revision: 'fce043ac9738950d5cd223955b86656bfaa42311',
  repository: 'moeru-ai/sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10',
  languages: ['ar', 'en', 'id', 'ja', 'ru', 'th', 'vi', 'zh'],
  source: { format: 'prepacked', directory: 'install/bin/wasm' },
} as const satisfies SherpawModel

/** Returns the same revision-scoped path for build output and runtime requests. */
export function sherpawModelPath(model: SherpawModel) {
  return `sherpaw/${model.id}/${model.revision}`
}
