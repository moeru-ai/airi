import { createChatProvider, createEmbedProvider, createModelProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const lmStudioConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('http://localhost:1234/v1/'),
})

type LMStudioConfig = z.input<typeof lmStudioConfigSchema>

export const providerLmStudio = defineProvider<LMStudioConfig>({
  id: 'lm-studio',
  order: 3,
  name: 'LM Studio',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.lm-studio.title'),
  description: 'LM Studio',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.lm-studio.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:lmstudio',
  iconColor: 'i-lobe-icons:lmstudio',

  createProviderConfig: ({ t }) => lmStudioConfigSchema.extend({
    apiKey: lmStudioConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: lmStudioConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return merge(
      createChatProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createEmbedProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity', 'model_list'],
      connectivityFailureReason: ({ errorMessage }) =>
        `Failed to reach LM Studio server, error: ${errorMessage} occurred.\n\nMake sure LM Studio is running and the local server is started. You can start the local server in LM Studio by going to the 'Local Server' tab and clicking 'Start Server'.`,
      modelListFailureReason: ({ errorMessage }) =>
        `Failed to reach LM Studio server, error: ${errorMessage} occurred.\n\nMake sure LM Studio is running and the local server is started. You can start the local server in LM Studio by going to the 'Local Server' tab and clicking 'Start Server'.`,
    }),
  },
})
