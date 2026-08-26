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
  createProvider(config) {
    return merge(
      createChatProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
  },
  createProviderConfig: ({ t }) => cometApiConfigSchema.extend({
    apiKey: cometApiConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: cometApiConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  icon: 'i-lobe-icons:cometapi',
  iconColor: 'i-lobe-icons:cometapi-color',
  id: 'comet-api',
  name: 'CometAPI',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  tasks: ['chat'],

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
  createProvider(config) {
    return merge(
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createSpeechProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
  },
  createProviderConfig: providerCometAPI.createProviderConfig,
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  icon: 'i-lobe-icons:cometapi',
  id: 'comet-api-speech',
  name: 'CometAPI Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: createOpenAICompatibleValidators({ checks: [ProviderValidationCheck.ModelList] }),
})

export const providerCometAPITranscription = defineProvider<CometApiConfig>({
  capabilities: {
    transcription: { generateOutput: true, protocol: 'http', streamInput: false, streamOutput: false },
  },
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
  createProviderConfig: providerCometAPI.createProviderConfig,
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  icon: 'i-lobe-icons:cometapi',
  id: 'comet-api-transcription',
  name: 'CometAPI Transcription',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: createOpenAICompatibleValidators({ checks: [ProviderValidationCheck.ModelList] }),
})
