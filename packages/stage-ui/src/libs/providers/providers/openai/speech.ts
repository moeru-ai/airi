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
 * OpenAI Speech/TTS Provider Implementation
 *
 * Implements BaseSpeechProviderDefinition for OpenAI's text-to-speech API.
 */
export const openaiSpeechProvider: BaseSpeechProviderDefinition = {
  id: 'openai-audio-speech',
  defaultModel: 'gpt-4o-mini-tts',
  defaultVoice: 'alloy',

  async validateConfig(config: BaseSpeechProviderConfig): Promise<ProviderValidationResult> {
    const errors: Error[] = []

    if (!config.apiKey) {
      errors.push(new Error('API Key is required'))
    }

    if (!config.baseUrl) {
      errors.push(new Error('Base URL is required. Default to https://api.openai.com/v1/ for official OpenAI API.'))
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
    return [
      {
        id: 'tts-1',
        name: 'TTS-1',
        provider: 'openai-audio-speech',
        description: '',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'tts-1-hd',
        name: 'TTS-1-HD',
        provider: 'openai-audio-speech',
        description: '',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'gpt-4o-mini-tts',
        name: 'GPT-4o Mini TTS',
        provider: 'openai-audio-speech',
        description: '',
        contextLength: 0,
        deprecated: false,
      },
    ]
  },

  async listVoices(_config: BaseSpeechProviderConfig): Promise<VoiceInfo[]> {
    return [
      {
        id: 'alloy',
        name: 'Alloy',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'ash',
        name: 'Ash',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'ballad',
        name: 'Ballad',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'coral',
        name: 'Coral',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'echo',
        name: 'Echo',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'fable',
        name: 'Fable',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'onyx',
        name: 'Onyx',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'nova',
        name: 'Nova',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'sage',
        name: 'Sage',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'shimmer',
        name: 'Shimmer',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'verse',
        name: 'Verse',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd'],
      },
      {
        id: 'marin',
        name: 'Marin',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['gpt-4o-mini-tts'],
      },
      {
        id: 'cedar',
        name: 'Cedar',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['gpt-4o-mini-tts'],
      },
    ]
  },

  getDefaultConfig(): Partial<BaseSpeechProviderConfig> {
    return {
      baseUrl: 'https://api.openai.com/v1/',
    }
  },

  supportsSSML(): boolean {
    return false
  },
}
