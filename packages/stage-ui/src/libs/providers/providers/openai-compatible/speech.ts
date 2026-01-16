import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'
import type {
  BaseSpeechProviderConfig,
  BaseSpeechProviderDefinition,
} from '../../base-speech'
import type { ProviderValidationResult } from '../../base-types'

import { createSpeechProvider } from '@xsai-ext/providers/utils'

/**
 * OpenAI Compatible Speech/TTS Provider Implementation
 *
 * Implements BaseSpeechProviderDefinition for any API that follows the OpenAI specification.
 * This is a generic implementation that works with OpenAI-compatible endpoints.
 */
export const openaiCompatibleSpeechProvider: BaseSpeechProviderDefinition = {
  id: 'openai-compatible-audio-speech',
  defaultModel: 'tts-1',
  defaultVoice: 'alloy',

  async validateConfig(config: BaseSpeechProviderConfig): Promise<ProviderValidationResult> {
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

  async createProvider(config: BaseSpeechProviderConfig) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

    if (!baseUrl.endsWith('/'))
      baseUrl += '/'

    return createSpeechProvider({ apiKey, baseURL: baseUrl }) as SpeechProvider | SpeechProviderWithExtraOptions<string, any>
  },

  async listModels(_config: BaseSpeechProviderConfig): Promise<ModelInfo[]> {
    // OpenAI Compatible providers don't have hardcoded models
    // Models are typically discovered via the API
    return []
  },

  async listVoices(_config: BaseSpeechProviderConfig): Promise<VoiceInfo[]> {
    // OpenAI Compatible providers don't have hardcoded voices
    // Voices are typically discovered via the API or user-configured
    return []
  },

  getDefaultConfig(): Partial<BaseSpeechProviderConfig> {
    return {}
  },

  supportsSSML(): boolean {
    return false
  },
}
