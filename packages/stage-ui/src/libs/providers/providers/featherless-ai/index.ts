import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const featherlessConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.featherless.ai/v1/'),
})

type FeatherlessConfig = z.input<typeof featherlessConfigSchema>

export const providerFeatherlessAI = defineProvider<FeatherlessConfig>({
  id: 'featherless-ai',
  name: 'Featherless.ai',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.featherless.title'),
  description: 'featherless.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.featherless.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:featherless-color',

  createProviderConfig: ({ t }) => featherlessConfigSchema.extend({
    apiKey: featherlessConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: featherlessConfigSchema.shape.baseUrl.meta({
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
      checks: ['connectivity', 'model_list'],
    }),
  },
})
