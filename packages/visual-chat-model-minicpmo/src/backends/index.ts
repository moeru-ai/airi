import type { OllamaConfig } from '../ollama/config'
import type { InferenceBackend } from './common/backend-types'

import { OllamaBackend } from '../ollama/backend'

export type BackendType = 'ollama'

export function createBackend(config: OllamaConfig): InferenceBackend {
  return new OllamaBackend(config)
}

export { OllamaBackend } from '../ollama/backend'
