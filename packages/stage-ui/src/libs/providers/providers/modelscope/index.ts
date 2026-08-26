import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const modelscopeConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api-inference.modelscope.cn/v1/'),
})

type ModelscopeConfig = z.input<typeof modelscopeConfigSchema>

export const providerModelScope = defineProvider<ModelscopeConfig>({
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },
  createProviderConfig: ({ t }) => modelscopeConfigSchema.extend({
    apiKey: modelscopeConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: modelscopeConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'modelscope',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.modelscope.description'),
  icon: 'i-lobe-icons:modelscope',
  iconColor: 'i-lobe-icons:modelscope-color',
  id: 'modelscope',
  name: 'ModelScope',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.modelscope.title'),
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
