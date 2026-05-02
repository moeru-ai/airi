import process from 'node:process'

export interface OllamaConfig {
  baseUrl?: string
  model?: string
}

export const defaultOllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'openbmb/minicpm-v4.5:latest',
} as const

export function resolveOllamaConfig(config: OllamaConfig): Required<OllamaConfig> {
  return {
    baseUrl: config.baseUrl ?? process.env.OLLAMA_HOST ?? defaultOllamaConfig.baseUrl,
    model: config.model ?? process.env.OLLAMA_MODEL ?? defaultOllamaConfig.model,
  }
}
