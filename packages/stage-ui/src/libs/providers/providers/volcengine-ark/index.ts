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
    .default('https://ark.cn-beijing.volces.com/api/v3/'),
  endpointId: z
    .string('Endpoint ID')
    .optional(),
})

type VolcengineArkConfig = z.input<typeof volcengineArkConfigSchema>

export const providerVolcengineArk = defineProvider<VolcengineArkConfig>({
  id: 'volcengine-ark',
  order: 20,
  name: 'Volcengine Ark',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine-ark.title'),
  description: 'Volcengine Ark (火山方舟) - volcengine.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine-ark.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:volcengine',

  createProviderConfig: ({ t }) => volcengineArkConfigSchema.extend({
    apiKey: volcengineArkConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.volcengine-ark.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: volcengineArkConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: 'https://ark.cn-beijing.volces.com/api/v3/',
    }),
    endpointId: volcengineArkConfigSchema.shape.endpointId.meta({
      labelLocalized: t('settings.pages.providers.provider.volcengine-ark.fields.field.endpoint-id.label'),
      descriptionLocalized: t('settings.pages.providers.provider.volcengine-ark.fields.field.endpoint-id.description'),
      placeholderLocalized: t('settings.pages.providers.provider.volcengine-ark.fields.field.endpoint-id.placeholder'),
    }),
  }),
  createProvider(config) {
    const baseUrl = config.baseUrl?.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`
    return createOpenAI(config.apiKey, baseUrl)
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
