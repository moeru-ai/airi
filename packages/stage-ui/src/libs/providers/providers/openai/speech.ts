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
    // TESTING NOTES: All 4 models tested and confirmed working with fable voice:
    // - tts-1: {model: "tts-1", input: "test", voice: "fable"} ✓
    // - tts-1-hd: {model: "tts-1-hd", input: "test", voice: "fable"} ✓
    // - gpt-4o-mini-tts: {model: "gpt-4o-mini-tts", input: "test", voice: "fable"} ✓
    // - gpt-4o-mini-tts-2025-12-15: {model: "gpt-4o-mini-tts-2025-12-15", input: "test", voice: "fable"} ✓
    return [
      {
        id: 'tts-1',
        name: 'TTS-1',
        provider: 'openai-audio-speech',
        description: 'Optimized for real-time text-to-speech tasks',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'tts-1-hd',
        name: 'TTS-1-HD',
        provider: 'openai-audio-speech',
        description: 'Higher fidelity audio output',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'gpt-4o-mini-tts',
        name: 'GPT-4o Mini TTS',
        provider: 'openai-audio-speech',
        description: 'GPT-4o Mini optimized for text-to-speech',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'gpt-4o-mini-tts-2025-12-15',
        name: 'GPT-4o Mini TTS (2025-12-15)',
        provider: 'openai-audio-speech',
        description: 'GPT-4o Mini TTS snapshot from 2025-12-15',
        contextLength: 0,
        deprecated: false,
      },
    ]
  },

  async listVoices(_config: BaseSpeechProviderConfig): Promise<VoiceInfo[]> {
    // NOTE: OpenAI does not provide an API endpoint to retrieve available voices.
    // Voices are hardcoded here - this is a provider limitation, not an application limitation.
    // Voice compatibility per https://platform.openai.com/docs/api-reference/audio/createSpeech:
    // - tts-1 and tts-1-hd support: alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer (9 voices)
    // - gpt-4o-mini-tts supports all 13 voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar
    return [
      {
        id: 'alloy',
        name: 'Alloy',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'ash',
        name: 'Ash',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'ballad',
        name: 'Ballad',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'coral',
        name: 'Coral',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'echo',
        name: 'Echo',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'fable',
        name: 'Fable',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'onyx',
        name: 'Onyx',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'nova',
        name: 'Nova',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'sage',
        name: 'Sage',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'shimmer',
        name: 'Shimmer',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'verse',
        name: 'Verse',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'marin',
        name: 'Marin',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
      },
      {
        id: 'cedar',
        name: 'Cedar',
        provider: 'openai-audio-speech',
        languages: [],
        compatibleModels: ['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
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
