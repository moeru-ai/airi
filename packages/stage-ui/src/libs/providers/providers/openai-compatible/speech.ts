import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'

import { createSpeechProvider } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const openAICompatibleSpeechConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL'),
})

type OpenAICompatibleSpeechConfig = z.input<typeof openAICompatibleSpeechConfigSchema>

/**
 * OpenAI Compatible Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for any API that follows the OpenAI specification.
 * This is a generic implementation that works with OpenAI-compatible endpoints.
 */
export const providerOpenAICompatibleSpeech = defineProvider<OpenAICompatibleSpeechConfig>({
  id: 'openai-compatible-audio-speech',
  order: 3,
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),
  description: 'OpenAI-compatible text-to-speech API',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  tasks: ['text-to-speech', 'speech'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => openAICompatibleSpeechConfigSchema.extend({
    apiKey: openAICompatibleSpeechConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAICompatibleSpeechConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    return createSpeechProvider({ apiKey, baseURL: baseUrl }) as SpeechProvider | SpeechProviderWithExtraOptions<string, any>
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    ...createOpenAICompatibleValidators<OpenAICompatibleSpeechConfig>({
      checks: ['connectivity'],
    }),
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
      // OpenAI Compatible providers don't have hardcoded models
      // Models are typically discovered via the API
      return []
    },

    async listVoices(_config): Promise<VoiceInfo[]> {
      // OpenAI Compatible providers don't have hardcoded voices
      // Voices are typically discovered via the API or user-configured
      return []
    },
  },
})

// Keep export for backward compatibility during migration
export const openaiCompatibleSpeechProvider = providerOpenAICompatibleSpeech
