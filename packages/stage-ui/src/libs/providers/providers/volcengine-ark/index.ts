import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const volcengineArkConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}/api/volcengine-ark/`),
})

type VolcengineArkConfig = z.input<typeof volcengineArkConfigSchema>

export const providerVolcengineArk = defineProvider<VolcengineArkConfig>({
  id: 'volcengine-ark',
  order: 5,
  name: 'Volcengine Ark',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine-ark.title'),
  description: 'ark.cn-beijing.volces.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine-ark.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:volcengine',
  iconColor: 'i-lobe-icons:volcengine',

  createProviderConfig: ({ t }) => volcengineArkConfigSchema.extend({
    apiKey: volcengineArkConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: volcengineArkConfigSchema.shape.baseUrl.meta({
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
        id: 'doubao-seed-2.0-pro',
        name: 'Doubao Seed 2.0 Pro',
        provider: 'volcengine-ark',
        description: '豆包大模型 Seed 2.0 Pro',
      },
      {
        id: 'doubao-1.5-pro-256k',
        name: 'Doubao 1.5 Pro 256K',
        provider: 'volcengine-ark',
        description: '豆包大模型 1.5 Pro 长上下文版本',
      },
      {
        id: 'doubao-1.5-pro-32k',
        name: 'Doubao 1.5 Pro 32K',
        provider: 'volcengine-ark',
        description: '豆包大模型 1.5 Pro',
      },
      {
        id: 'doubao-1.5-thinking-pro-250415',
        name: 'Doubao 1.5 Thinking Pro',
        provider: 'volcengine-ark',
        description: '豆包大模型 1.5 推理版',
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
