import { createTogetherAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const togetherConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.together.xyz/v1/'),
})

type TogetherConfig = z.input<typeof togetherConfigSchema>

export const providerTogetherAI = defineProvider<TogetherConfig>({
  id: 'together-ai',
  name: 'Together.ai',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.together.title'),
  description: 'together.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.together.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:together',
  iconColor: 'i-lobe-icons:together-color',

  createProviderConfig: ({ t }) => togetherConfigSchema.extend({
    apiKey: togetherConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: togetherConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createTogetherAI(config.apiKey, config.baseUrl)
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
