/** Model groups shared by the build plugin and the Hearing Provider. */
export const sherpawModels = {
  'zh-en': {
    name: 'Chinese / English',
    revision: '8e40c43232a1c5c66c82111efc5820d3accca11b',
    repository: 'csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en',
    languages: ['zh', 'en'],
  },
  'multilingual': {
    name: 'Arabic / English / Indonesian / Japanese / Russian / Thai / Vietnamese / Chinese',
    revision: 'fce043ac9738950d5cd223955b86656bfaa42311',
    repository: 'moeru-ai/sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10',
    languages: ['ar', 'en', 'id', 'ja', 'ru', 'th', 'vi', 'zh'],
  },
} as const

/** Selects a bundled model group, not a forced recognition language. */
export type SherpawLanguageGroup = keyof typeof sherpawModels

/** Returns a revision-scoped path shared by Vite output and runtime requests. */
export function sherpawModelPath(group: SherpawLanguageGroup) {
  return `sherpaw/${group}/${sherpawModels[group].revision}`
}
