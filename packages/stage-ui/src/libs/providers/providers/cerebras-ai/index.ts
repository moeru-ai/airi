import { createCerebras } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const cerebrasConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.cerebras.ai/v1/'),
})

type CerebrasConfig = z.input<typeof cerebrasConfigSchema>

export const providerCerebrasAI = defineProvider<CerebrasConfig>({
  id: 'cerebras-ai',
  name: 'Cerebras',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.cerebras.title'),
  description: 'cerebras.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.cerebras.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:cerebras',
  iconColor: 'i-lobe-icons:cerebras-color',

  createProviderConfig: ({ t }) => cerebrasConfigSchema.extend({
    apiKey: cerebrasConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: cerebrasConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createCerebras(config.apiKey, config.baseUrl)
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
