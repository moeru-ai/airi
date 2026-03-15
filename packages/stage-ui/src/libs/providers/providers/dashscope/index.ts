import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const dashscopeConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}/api/dashscope/`),
})

type DashscopeConfig = z.input<typeof dashscopeConfigSchema>

export const providerDashscope = defineProvider<DashscopeConfig>({
  id: 'dashscope',
  order: 5,
  name: 'Dashscope',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.dashscope.title'),
  description: 'dashscope.aliyuncs.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.dashscope.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:alibabacloud',
  iconColor: 'i-lobe-icons:alibabacloud',

  createProviderConfig: ({ t }) => dashscopeConfigSchema.extend({
    apiKey: dashscopeConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: dashscopeConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },

  extraMethods: {
    listModels: async () => ([
      {
        id: 'qwen3.5-plus',
        name: 'Qwen 3.5 Plus',
        provider: 'dashscope',
        description: '通义千问 3.5 Plus',
      },
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        provider: 'dashscope',
        description: '通义千问 Plus',
      },
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        provider: 'dashscope',
        description: '通义千问 Max',
      },
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        provider: 'dashscope',
        description: '通义千问 Turbo',
      },
      {
        id: 'qwen3-235b-a22b',
        name: 'Qwen3 235B A22B',
        provider: 'dashscope',
        description: '通义千问 3 旗舰版',
      },
    ]),
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity'],
    }),
  },
})
