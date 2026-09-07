import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const openAICompatibleConfigSchema = z.object({
  api: z.enum(['chat-completions', 'responses']).default('chat-completions'),
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1'),
})

type OpenAICompatibleConfig = z.input<typeof openAICompatibleConfigSchema>

export const providerOpenAICompatible = defineProvider<OpenAICompatibleConfig, 'openai-compatible'>({
  id: 'openai-compatible',
  order: 4,
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),
  description: 'OpenAI-compatible chat APIs with API key authentication.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => openAICompatibleConfigSchema.extend({
    api: openAICompatibleConfigSchema.shape.api.meta({
      type: 'select',
      options: [{ label: 'Chat Completions', value: 'chat-completions' }, { label: 'Responses API', value: 'responses' }],
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.description'),
    }),
    apiKey: openAICompatibleConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openAICompatibleConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey ?? '', config.baseUrl)
    return {
      ...provider,
      responses: config.api === 'responses' ? (model: string) => provider.chat(model) : undefined,
    }
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
