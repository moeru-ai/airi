import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const openPathsConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://openpaths.io/v1'),
})

type OpenPathsConfig = z.input<typeof openPathsConfigSchema>

export const providerOpenPaths = defineProvider<OpenPathsConfig>({
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },
  createProviderConfig: ({ t }) => openPathsConfigSchema.extend({
    apiKey: openPathsConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openPathsConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'openpaths.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openpaths.description'),
  icon: 'i-lobe-icons:openai',
  id: 'openpaths',
  name: 'OpenPaths',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openpaths.title'),
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
