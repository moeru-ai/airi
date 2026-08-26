import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const openAICompatibleConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1'),
})

type OpenAICompatibleConfig = z.input<typeof openAICompatibleConfigSchema>

export const providerOpenAICompatible = defineProvider<OpenAICompatibleConfig>({
  createProvider(config) {
    return createOpenAI(config.apiKey as string, config.baseUrl)
  },
  createProviderConfig: ({ t }) => openAICompatibleConfigSchema.extend({
    apiKey: openAICompatibleConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAICompatibleConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'OpenAI-compatible chat APIs with API key authentication.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  icon: 'i-lobe-icons:openai',
  id: 'openai-compatible',
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),

  order: 4,
  tasks: ['chat'],

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
