import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const yApiConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.y-api.bestvirtualgoods.com/v1'),
})

type YApiConfig = z.input<typeof yApiConfigSchema>

export const providerYAPI = defineProvider<YApiConfig, 'y-api'>({
  id: 'y-api',
  order: 9,
  name: 'Y-API',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.y-api.title'),
  description: 'OpenAI-compatible gateway serving models from multiple vendors behind one endpoint.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.y-api.description'),
  tasks: ['chat'],
  // No brand icon in @proj-airi/lobe-icons yet. n1n, OpenPaths and Atlas Cloud use the
  // same fallback until their own icon lands.
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => yApiConfigSchema.extend({
    apiKey: yApiConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: yApiConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey || '', config.baseUrl)
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
