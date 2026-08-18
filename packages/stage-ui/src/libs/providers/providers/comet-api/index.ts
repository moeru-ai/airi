import { createChatProvider, createModelProvider, createSpeechProvider, createTranscriptionProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const cometApiConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.cometapi.com/v1/'),
})

type CometApiConfig = z.input<typeof cometApiConfigSchema>

export const providerCometAPI = defineProvider<CometApiConfig>({
  id: 'comet-api',
  name: 'CometAPI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:cometapi',
  iconColor: 'i-lobe-icons:cometapi-color',

  createProviderConfig: ({ t }) => cometApiConfigSchema.extend({
    apiKey: cometApiConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: cometApiConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return merge(
      createChatProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})

export const providerCometAPISpeech = defineProvider<CometApiConfig>({
  id: 'comet-api-speech',
  name: 'CometAPI Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:cometapi',
  createProviderConfig: providerCometAPI.createProviderConfig,
  createProvider(config) {
    return merge(
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createSpeechProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: createOpenAICompatibleValidators({ checks: [ProviderValidationCheck.ModelList] }),
})

export const providerCometAPITranscription = defineProvider<CometApiConfig>({
  id: 'comet-api-transcription',
  name: 'CometAPI Transcription',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:cometapi',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: providerCometAPI.createProviderConfig,
  createProvider(config) {
    const provider = merge(
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createTranscriptionProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
    const transcription = provider.transcription.bind(provider)
    provider.transcription = (model: string, extraOptions?: Record<string, unknown>) => ({
      ...transcription(model),
      ...extraOptions,
    })
    return provider
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: createOpenAICompatibleValidators({ checks: [ProviderValidationCheck.ModelList] }),
})
