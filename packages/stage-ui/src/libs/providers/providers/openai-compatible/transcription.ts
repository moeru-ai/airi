import type {
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo } from '../../../../stores/providers'
import type {
  BaseTranscriptionProviderConfig,
} from '../../base-transcription'
import type { ProviderValidationResult } from '../../base-types'

import { createTranscriptionProvider } from '@xsai-ext/providers/utils'

import { normalizeBaseUrl } from '../../utils'
import { defineTranscriptionProvider } from '../registry-transcription'

/**
 * OpenAI Compatible Transcription/STT Provider Implementation
 *
 * Implements BaseTranscriptionProviderDefinition for any API that follows the OpenAI specification.
 * This is a generic implementation that works with OpenAI-compatible endpoints.
 */
export const openaiCompatibleTranscriptionProvider = defineTranscriptionProvider({
  id: 'openai-compatible-audio-transcription',
  defaultModel: 'whisper-1',
  transcriptionFeatures: {
    supportsGenerate: true,
    supportsStreamOutput: false,
    supportsStreamInput: false,
  },

  async validateConfig(config: BaseTranscriptionProviderConfig): Promise<ProviderValidationResult> {
    const errors: Error[] = []

    if (!config.apiKey) {
      errors.push(new Error('API Key is required'))
    }

    if (!config.baseUrl) {
      errors.push(new Error('Base URL is required'))
    }

    if (errors.length > 0) {
      return {
        errors,
        reason: errors.map(e => e.message).join(', '),
        valid: false,
      }
    }

    return {
      errors: [],
      reason: '',
      valid: true,
    }
  },

  async createProvider(config: BaseTranscriptionProviderConfig) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createTranscriptionProvider({ apiKey, baseURL: baseUrl }) as TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, any>
  },

  async listModels(_config: BaseTranscriptionProviderConfig): Promise<ModelInfo[]> {
    // OpenAI Compatible providers don't have hardcoded models
    // Models are typically discovered via the API
    return []
  },

  getDefaultConfig(): Partial<BaseTranscriptionProviderConfig> {
    return {}
  },
})
