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
 * OpenAI Transcription/STT Provider Implementation
 *
 * Implements BaseTranscriptionProviderDefinition for OpenAI's Whisper API.
 */
export const openaiTranscriptionProvider = defineTranscriptionProvider({
  id: 'openai-audio-transcription',
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

  async createProvider(config: BaseTranscriptionProviderConfig) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createTranscriptionProvider({ apiKey, baseURL: baseUrl }) as TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, any>
  },

  async listModels(_config: BaseTranscriptionProviderConfig): Promise<ModelInfo[]> {
    // OpenAI transcription models are hardcoded (no API endpoint to list them)
    return [
      {
        id: 'gpt-4o-transcribe',
        name: 'GPT-4o Transcribe',
        provider: 'openai-audio-transcription',
        description: 'High-quality transcription model',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'gpt-4o-mini-transcribe',
        name: 'GPT-4o Mini Transcribe',
        provider: 'openai-audio-transcription',
        description: 'Faster, cost-effective transcription model',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'gpt-4o-mini-transcribe-2025-12-15',
        name: 'GPT-4o Mini Transcribe (2025-12-15)',
        provider: 'openai-audio-transcription',
        description: 'GPT-4o Mini Transcribe snapshot from 2025-12-15',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'whisper-1',
        name: 'Whisper-1',
        provider: 'openai-audio-transcription',
        description: 'Powered by our open source Whisper V2 model',
        contextLength: 0,
        deprecated: false,
      },
      {
        id: 'gpt-4o-transcribe-diarize',
        name: 'GPT-4o Transcribe Diarize',
        provider: 'openai-audio-transcription',
        description: 'Transcription with speaker diarization',
        contextLength: 0,
        deprecated: false,
      },
    ]
  },

  getDefaultConfig(): Partial<BaseTranscriptionProviderConfig> {
    return {
      baseUrl: 'https://api.openai.com/v1/',
    }
  },
})
