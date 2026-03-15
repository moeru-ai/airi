import { createMistral } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
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
  id: 'mistral-ai',
  name: 'Mistral',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.mistral.title'),
  description: 'mistral.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.mistral.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:mistral',
  iconColor: 'i-lobe-icons:mistral-color',

  createProviderConfig: ({ t }) => mistralConfigSchema.extend({
    apiKey: mistralConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: mistralConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createMistral(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity', 'model_list'],
    }),
  },
})
