import type {
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo } from '../../../../stores/providers'

import { createTranscriptionProvider } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const openAITranscriptionConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1/'),
})

type OpenAITranscriptionConfig = z.input<typeof openAITranscriptionConfigSchema>

/**
 * OpenAI Transcription/STT Provider Implementation
 *
 * Uses the unified defineProvider pattern for OpenAI's Whisper API.
 */
export const providerOpenAITranscription = defineProvider<OpenAITranscriptionConfig>({
  id: 'openai-audio-transcription',
  order: 1,
  name: 'OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai.title'),
  description: 'OpenAI transcription API',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => openAITranscriptionConfigSchema.extend({
    apiKey: openAITranscriptionConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAITranscriptionConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createTranscriptionProvider({ apiKey, baseURL: baseUrl }) as TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, any>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    ...createOpenAICompatibleValidators<OpenAITranscriptionConfig>({
      checks: ['connectivity'],
    }),
  },

  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: false,
      streamInput: false,
    },
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
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
  },
})

// Keep export for backward compatibility during migration
export const openaiTranscriptionProvider = providerOpenAITranscription
