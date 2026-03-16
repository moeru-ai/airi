export type PlannerEmbeddingPresetId = 'openai_text_embedding_3' | 'qwen3_embedding_v4'
export type QwenEmbeddingRegion = 'intl' | 'cn'

export const plannerEmbeddingPresetIds = [
  'openai_text_embedding_3',
  'qwen3_embedding_v4',
] as const

export const openAIEmbeddingModels = [
  'text-embedding-3-small',
  'text-embedding-3-large',
] as const
export type OpenAIEmbeddingModel = (typeof openAIEmbeddingModels)[number]

export const qwenEmbeddingModel = 'text-embedding-v4'
export const qwenEmbeddingRegionBaseURLs: Record<QwenEmbeddingRegion, string> = {
  intl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  cn: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

export const plannerEmbeddingPresets = {
  openai_text_embedding_3: {
    id: 'openai_text_embedding_3',
    providerId: 'openai',
    defaultModel: 'text-embedding-3-small',
  },
  qwen3_embedding_v4: {
    id: 'qwen3_embedding_v4',
    providerId: 'openai-compatible',
    defaultModel: qwenEmbeddingModel,
  },
} as const

export function isOpenAIEmbeddingModel(value: string): value is OpenAIEmbeddingModel {
  return openAIEmbeddingModels.includes(value as OpenAIEmbeddingModel)
}
