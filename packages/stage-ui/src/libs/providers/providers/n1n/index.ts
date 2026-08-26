import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const n1nConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.n1n.ai/v1'),
})

type N1NConfig = z.input<typeof n1nConfigSchema>

export const providerN1N = defineProvider<N1NConfig>({
  createProvider(config) {
    return createOpenAI(config.apiKey || '', config.baseUrl)
  },
  createProviderConfig: ({ t }) => n1nConfigSchema.extend({
    apiKey: n1nConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: n1nConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'n1n.ai - High-performance AI API provider.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.n1n.description'),
  icon: 'i-lobe-icons:openai',
  id: 'n1n',
  name: 'n1n',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.n1n.title'),

  order: 9,
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
