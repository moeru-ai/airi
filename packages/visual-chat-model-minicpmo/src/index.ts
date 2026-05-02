export type { BackendType } from './backends'
export { createBackend, OllamaBackend } from './backends'
export type { BackendEventMap } from './backends/common/backend-events'
export type {
  DecodedChunk,
  DecodeResult,
  InferenceBackend,
  PrefillPayload,
} from './backends/common/backend-types'
export { decodedChunksToDecodeResult } from './backends/common/backend-types'
export type { OllamaConfig } from './ollama/config'
export { defaultOllamaConfig, resolveOllamaConfig } from './ollama/config'
export { checkHealth as checkOllamaHealth, listModels as listOllamaModels } from './ollama/http-api'
export { assistantSystemPromptEn } from './prompts/assistant-en'
export { assistantSystemPromptZh } from './prompts/assistant-zh'
