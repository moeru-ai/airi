import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

export const ATLASCLOUD_DEFAULT_BASE_URL = 'https://api.atlascloud.ai/v1'

const atlasCloudConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(ATLASCLOUD_DEFAULT_BASE_URL),
})

type AtlasCloudConfig = z.input<typeof atlasCloudConfigSchema>

export const providerAtlasCloud = defineProvider<AtlasCloudConfig>({
  id: 'atlascloud',
  order: 5,
  name: 'Atlas Cloud',
  nameLocalize: () => 'Atlas Cloud',
  description: 'api.atlascloud.ai',
  descriptionLocalize: () => 'api.atlascloud.ai',
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => atlasCloudConfigSchema.extend({
    apiKey: atlasCloudConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: atlasCloudConfigSchema.shape.baseUrl.meta({
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
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
