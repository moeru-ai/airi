import type { ChatProvider as XsaiChatProvider } from '@xsai-ext/providers/utils'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const lobsterAgentConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('http://127.0.0.1:19888'),
})

type LobsterAgentConfig = z.input<typeof lobsterAgentConfigSchema>

function normalizeBaseUrl(baseUrl?: string): string {
  const value = baseUrl?.trim()
  if (!value) {
    return 'http://127.0.0.1:19888'
  }
  if (value.includes('://localhost:11434') || value.includes('://127.0.0.1:11434')) {
    return 'http://127.0.0.1:19888'
  }
  return value
}

function createLobsterAgentProvider(config: LobsterAgentConfig): XsaiChatProvider {
  return createOpenAI(config.apiKey as string, normalizeBaseUrl(config.baseUrl as string))
}

function normalizeValidationConfig(config: any) {
  return {
    ...config,
    baseUrl: normalizeBaseUrl(config?.baseUrl as string),
  }
}

const baseValidators = createOpenAICompatibleValidators({
  checks: ['connectivity', 'chat_completions'],
}) ?? {}

const lobsterAgentValidators = {
  validateConfig: (baseValidators.validateConfig ?? []).map(factory => (ctx: any) => {
    const rule = factory(ctx)
    return {
      ...rule,
      validator: async (config: any, contextOptions: any) =>
        rule.validator(normalizeValidationConfig(config), contextOptions),
    }
  }),
  validateProvider: (baseValidators.validateProvider ?? []).map(factory => (ctx: any) => {
    const rule = factory(ctx)
    return {
      ...rule,
      validator: async (config: any, provider: any, providerExtra: any, contextOptions: any) => {
        return rule.validator(normalizeValidationConfig(config), provider, providerExtra, contextOptions)
      },
    }
  }),
}

export const providerLobsterAgent = defineProvider<LobsterAgentConfig>({
  id: 'lobster-agent',
  order: 1,
  name: 'Lobster Agent',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.lobster-agent.title'),
  description: 'LobsterAI Claude Agent with desktop control capabilities',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.lobster-agent.description'),
  tasks: ['chat', 'agent'],
  icon: 'i-lobe-icons:claude',
  iconColor: 'i-lobe-icons:claude-color',

  createProviderConfig: ({ t }) => lobsterAgentConfigSchema.extend({
    apiKey: lobsterAgentConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: lobsterAgentConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    return createLobsterAgentProvider({
      apiKey: config.apiKey as string,
      baseUrl: normalizeBaseUrl(config.baseUrl as string),
    })
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  validators: {
    ...lobsterAgentValidators,
  },
})
