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

const openAICompatibleTranscriptionConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL'),
})

type OpenAICompatibleTranscriptionConfig = z.input<typeof openAICompatibleTranscriptionConfigSchema>

/**
 * OpenAI Compatible Transcription/STT Provider Implementation
 *
 * Uses the unified defineProvider pattern for any API that follows the OpenAI specification.
 * This is a generic implementation that works with OpenAI-compatible endpoints.
 */
export const providerOpenAICompatibleTranscription = defineProvider<OpenAICompatibleTranscriptionConfig>({
  id: 'openai-compatible-audio-transcription',
  order: 3,
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),
  description: 'OpenAI-compatible transcription API',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => openAICompatibleTranscriptionConfigSchema.extend({
    apiKey: openAICompatibleTranscriptionConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAICompatibleTranscriptionConfigSchema.shape.baseUrl.meta({
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
    ...createOpenAICompatibleValidators<OpenAICompatibleTranscriptionConfig>({
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
      // OpenAI Compatible providers don't have hardcoded models
      // Models are typically discovered via the API
      return []
    },
  },
})

// Keep export for backward compatibility during migration
export const openaiCompatibleTranscriptionProvider = providerOpenAICompatibleTranscription
