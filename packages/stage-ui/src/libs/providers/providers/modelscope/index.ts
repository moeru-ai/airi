import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
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
  id: 'modelscope',
  name: 'ModelScope',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.modelscope.title'),
  description: 'modelscope',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.modelscope.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:modelscope',
  iconColor: 'i-lobe-icons:modelscope-color',

  createProviderConfig: ({ t }) => modelscopeConfigSchema.extend({
    apiKey: modelscopeConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: modelscopeConfigSchema.shape.baseUrl.meta({
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
