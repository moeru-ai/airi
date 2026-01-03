import { createPerplexity } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const perplexityConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.perplexity.ai/'),
})

type PerplexityConfig = z.input<typeof perplexityConfigSchema>

export const providerPerplexityAI = defineProvider<PerplexityConfig>({
  id: 'perplexity-ai',
  name: 'Perplexity',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.perplexity.title'),
  description: 'perplexity.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.perplexity.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:perplexity',
  iconColor: 'i-lobe-icons:perplexity-color',

  createProviderConfig: ({ t }) => perplexityConfigSchema.extend({
    apiKey: perplexityConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: perplexityConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createPerplexity(config.apiKey, config.baseUrl)
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
