import type { ChatRequestOptions } from '../../types'

import { createOpenRouter } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

export const OPENROUTER_ATTRIBUTION_HEADERS: Record<string, string> = {
  'HTTP-Referer': 'https://airi.moeru.ai/',
  'X-OpenRouter-Title': 'Project AIRI',
}

const openRouterConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://openrouter.ai/api/v1/'),
})

type OpenRouterConfig = z.input<typeof openRouterConfigSchema>

export const providerOpenRouterAI = defineProvider<OpenRouterConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  createProvider(config) {
    const base = createOpenRouter(config.apiKey, config.baseUrl)
    return {
      ...base,
      chat(model: string, options?: ChatRequestOptions) {
        const request = {
          ...base.chat(model),
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers)
            for (const [k, v] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS))
              headers.set(k, v)
            return globalThis.fetch(input, { ...init, headers })
          },
        }

        if (!options?.reasoning)
          return request

        return { ...request, reasoning: { effort: options.reasoning === 'enabled' ? 'medium' : 'none' } }
      },
    }
  },
  createProviderConfig: ({ t }) => openRouterConfigSchema.extend({
    apiKey: openRouterConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openRouterConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'openrouter.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter.description'),
  icon: 'i-lobe-icons:openrouter',
  id: 'openrouter-ai',
  name: 'OpenRouter',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter.title'),

  order: 0,
  tasks: ['chat'],

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      additionalHeaders: OPENROUTER_ATTRIBUTION_HEADERS,
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
