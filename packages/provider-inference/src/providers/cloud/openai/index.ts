import type { ChatRequestOptions, GenerationRequest, ResponsesConfig } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { openaiChatModels } from 'model-bank/openai'
import { z } from 'zod'

import { openAIProtocols, supportsOpenAIWebSearchEndpoint } from '../../../generation'
import { listModelCatalog } from '../../../model-catalog'
import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const configSchema = z.object({
  api: z.enum(openAIProtocols.supportedProtocols).default(openAIProtocols.defaultProtocol),
  webSearch: z.boolean().default(false),
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.openai.com/v1'),
})

type Config = z.input<typeof configSchema>

export const providerOpenAI = defineProvider<Config, 'openai'>({
  id: 'openai',
  order: 5,
  name: 'OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openai.title'),
  description: 'OpenAI',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openai.description'),
  tasks: ['chat'],
  capabilities: { chat: { generation: openAIProtocols, reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t, config }) => configSchema.extend({
    api: configSchema.shape.api.meta({
      type: 'select',
      options: openAIProtocols.supportedProtocols.map(value => ({ label: value === 'responses' ? 'Responses API' : 'Chat Completions', value })),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-protocol.description'),
    }),
    webSearch: configSchema.shape.webSearch.meta({
      type: 'boolean',
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.web-search.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.web-search.description'),
      disabled: config?.api === 'chat-completions' || !supportsOpenAIWebSearchEndpoint(config?.baseUrl ?? 'https://api.openai.com/v1'),
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
    const provider = createOpenAI(config.apiKey, config.baseUrl)
    return {
      model: provider.model,
      generation(model: string, options?: ChatRequestOptions): GenerationRequest {
        const request = provider.chat(model)
        if ((config.api ?? openAIProtocols.defaultProtocol) === 'responses') {
          const responseConfig: ResponsesConfig = { ...request }
          if (options?.reasoning) {
            responseConfig.reasoning = options.reasoning === 'enabled'
              ? { effort: 'medium', summary: 'auto' }
              : { effort: 'none' }
          }
          return {
            protocol: 'responses',
            webSearch: config.webSearch === true && supportsOpenAIWebSearchEndpoint(request.baseURL),
            config: responseConfig,
          }
        }
        return {
          protocol: 'chat-completions',
          config: { ...request, ...(options?.reasoning ? { reasoningEffort: options.reasoning === 'enabled' ? 'medium' : 'none' } : {}) },
        }
      },
    }
  },

  extraMethods: {
    listModelCatalog: config => listModelCatalog(
      { apiKey: config.apiKey, baseURL: config.baseUrl ?? 'https://api.openai.com/v1' },
      { source: 'model-bank', models: openaiChatModels, providerId: 'openai', baseURL: 'https://api.openai.com/v1' },
    ),
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
      chatCompletionTokenParameter: 'max_completion_tokens',
    }),
  },
})
