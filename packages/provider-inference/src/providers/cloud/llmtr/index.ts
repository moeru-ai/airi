import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

export const LLMTR_DEFAULT_BASE_URL = 'https://llmtr.com/v1/'

const llmtrConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(LLMTR_DEFAULT_BASE_URL),
})

type LlmtrConfig = z.input<typeof llmtrConfigSchema>

export const providerLlmtr = defineProvider<LlmtrConfig, 'llmtr'>({
  id: 'llmtr',
  name: 'LLMTR',
  nameLocalize: () => 'LLMTR',
  description: 'llmtr.com',
  descriptionLocalize: () => 'llmtr.com',
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => llmtrConfigSchema.extend({
    apiKey: llmtrConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: llmtrConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
