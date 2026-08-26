import { createMistral } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const mistralConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.mistral.ai/v1/'),
})

type MistralConfig = z.input<typeof mistralConfigSchema>

export const providerMistralAI = defineProvider<MistralConfig>({
  createProvider(config) {
    return createMistral(config.apiKey, config.baseUrl)
  },
  createProviderConfig: ({ t }) => mistralConfigSchema.extend({
    apiKey: mistralConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: mistralConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'mistral.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mistral.description'),
  icon: 'i-lobe-icons:mistral',
  iconColor: 'i-lobe-icons:mistral-color',
  id: 'mistral-ai',
  name: 'Mistral',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mistral.title'),
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
