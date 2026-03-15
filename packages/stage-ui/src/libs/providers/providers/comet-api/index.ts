import { createChatProvider, createModelProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const cometApiConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.cometapi.com/v1/'),
})

type CometApiConfig = z.input<typeof cometApiConfigSchema>

export const providerCometAPI = defineProvider<CometApiConfig>({
  id: 'comet-api',
  name: 'CometAPI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.title'),
  description: 'cometapi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.comet-api.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:cometapi',
  iconColor: 'i-lobe-icons:cometapi-color',

  createProviderConfig: ({ t }) => cometApiConfigSchema.extend({
    apiKey: cometApiConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: cometApiConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return merge(
      createChatProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['model_list'],
    }),
  },
})
