import type { GenerationRequest } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { compatibleProtocols } from '../../../generation'
import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const configSchema = z.object({
  api: z.enum(compatibleProtocols.supportedProtocols).default(compatibleProtocols.defaultProtocol),
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1'),
})

type Config = z.input<typeof configSchema>

export const providerOpenAICompatible = defineProvider<Config, 'openai-compatible'>({
  id: 'openai-compatible',
  order: 4,
  name: 'OpenAI Compatible',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.title'),
  description: 'OpenAI-compatible chat APIs with API key authentication.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai-compatible.description'),
  tasks: ['chat'],
  capabilities: { chat: { generation: compatibleProtocols } },
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => configSchema.extend({
    api: configSchema.shape.api.meta({
      type: 'select',
      options: compatibleProtocols.supportedProtocols.map(value => ({ label: value === 'responses' ? 'Responses API' : 'Chat Completions', value })),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.description'),
    }),
    apiKey: configSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: configSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey ?? '', config.baseUrl)
    return {
      model: provider.model,
      generation(model: string): GenerationRequest {
        const request = provider.chat(model)
        return config.api === 'responses'
          ? { protocol: 'responses', config: request, webSearch: false }
          : { protocol: 'chat-completions', config: request }
      },
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
