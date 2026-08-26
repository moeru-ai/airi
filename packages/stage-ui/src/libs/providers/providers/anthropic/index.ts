import type { ModelInfo } from '../../types'

import { createChatProvider, createModelProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const anthropicConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.anthropic.com/v1/'),
})

type AnthropicConfig = z.input<typeof anthropicConfigSchema>

function createAnthropic(apiKey: string, baseURL: string = 'https://api.anthropic.com/v1/') {
  const anthropicFetch = async (input: any, init: any) => {
    init.headers ??= {}
    if (Array.isArray(init.headers))
      init.headers.push(['anthropic-dangerous-direct-browser-access', 'true'])
    else if (init.headers instanceof Headers)
      init.headers.append('anthropic-dangerous-direct-browser-access', 'true')
    else
      init.headers['anthropic-dangerous-direct-browser-access'] = 'true'

    return fetch(input, init)
  }

  return merge(
    createChatProvider({ apiKey, baseURL, fetch: anthropicFetch }),
    createModelProvider({ apiKey, baseURL, fetch: anthropicFetch }),
  )
}

export const providerAnthropic = defineProvider<AnthropicConfig>({
  createProvider(config) {
    return createAnthropic(config.apiKey, config.baseUrl)
  },
  createProviderConfig: ({ t }) => anthropicConfigSchema.extend({
    apiKey: anthropicConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: anthropicConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'anthropic.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.anthropic.description'),
  extraMethods: {
    listModels: async () => ([
      {
        description: 'Anthropic fastest model with near-frontier intelligence',
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
      },
      {
        description: 'Anthropic smartest model for complex agents and coding',
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
      },
      {
        description: 'Exceptional model for specialized reasoning tasks',
        id: 'claude-opus-4-1-20250805',
        name: 'Claude Opus 4.1',
        provider: 'anthropic',
      },
    ] satisfies ModelInfo[]),
  },
  icon: 'i-lobe-icons:claude',
  iconColor: 'i-lobe-icons:claude-color',
  id: 'anthropic',
  name: 'Anthropic',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.anthropic.title'),
  order: 6,

  tasks: ['chat'],
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      additionalHeaders: {
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
