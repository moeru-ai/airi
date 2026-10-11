import type { OpenRouterAudioConfig } from '../openrouter-audio/shared'

import { createOpenAI } from '@xsai-ext/providers/create'

import { defineProvider } from '../../registry'
import { OPENROUTER_ATTRIBUTION_HEADERS } from '../openrouter-ai'
import { normalizeOpenRouterAudioBaseUrl, openRouterAudioConfigSchema } from '../openrouter-audio/shared'

export const providerOpenRouterAudioTranscription = defineProvider<OpenRouterAudioConfig, 'openrouter-audio-transcription'>({
  id: 'openrouter-audio-transcription',
  name: 'OpenRouter',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter.title'),
  description: 'openrouter.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:openrouter',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: ({ t }) => openRouterAudioConfigSchema.extend({
    apiKey: openRouterAudioConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openRouterAudioConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey.trim(), normalizeOpenRouterAudioBaseUrl(config.baseUrl))
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'openrouter-audio-transcription:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async config => ({
          errors: config.apiKey?.trim() ? [] : [{ error: new Error('API Key is required.') }],
          reason: config.apiKey?.trim() ? '' : 'API Key is required.',
          reasonKey: '',
          valid: Boolean(config.apiKey?.trim()),
        }),
      }),
    ],
  },
  extraMethods: {
    listModels: async (config) => {
      const response = await fetch(new URL('models?output_modalities=transcription', normalizeOpenRouterAudioBaseUrl(config.baseUrl)), {
        headers: {
          Authorization: `Bearer ${config.apiKey.trim()}`,
          ...OPENROUTER_ATTRIBUTION_HEADERS,
        },
      })
      if (!response.ok)
        throw new Error(`OpenRouter transcription model request failed: ${response.status} ${await response.text()}`)

      const data = await response.json() as {
        data?: Array<{ id: string, name?: string, description?: string, context_length?: number }>
      }
      return (data.data ?? []).map(model => ({
        id: model.id,
        name: model.name || model.id,
        provider: 'openrouter-audio-transcription',
        description: model.description || '',
        contextLength: model.context_length || 0,
        deprecated: false,
      }))
    },
  },
})
