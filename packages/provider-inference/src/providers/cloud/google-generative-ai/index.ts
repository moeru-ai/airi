import type { ChatRequestOptions } from '../../../types'

import { createGoogleGenerativeAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const googleGenerativeConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://generativelanguage.googleapis.com/v1beta/openai/'),
})

type GoogleGenerativeConfig = z.input<typeof googleGenerativeConfigSchema>

export const providerGoogleGenerativeAI = defineProvider<GoogleGenerativeConfig, 'google-generative-ai'>({
  id: 'google-generative-ai',
  order: 8,
  name: 'Google Gemini',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.google-generative-ai.title'),
  description: 'ai.google.dev',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.google-generative-ai.description'),
  tasks: ['chat'],
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-lobe-icons:gemini',
  iconColor: 'i-lobe-icons:gemini-color',

  createProviderConfig: ({ t }) => googleGenerativeConfigSchema.extend({
    apiKey: googleGenerativeConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: googleGenerativeConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createGoogleGenerativeAI(config.apiKey, config.baseUrl)
    return {
      ...provider,
      chat(model: string, options?: ChatRequestOptions) {
        const request = provider.chat(model)
        if (!options?.reasoning)
          return request

        if (options.reasoning === 'enabled')
          return { ...request, reasoningEffort: 'medium' }

        // NOTICE:
        // Use the lowest supported effort when the user disables reasoning.
        // Gemini 2.5 Pro and Gemini 3 cannot turn off reasoning. Gemini 3 Pro starts at low.
        // https://ai.google.dev/gemini-api/docs/thinking#thinking-levels
        // Remove this mapping when Google accepts `none` for these models.
        const modelId = model.toLowerCase()
        if (/gemini-3(?:\.\d+)?-pro\b/.test(modelId))
          return { ...request, reasoningEffort: 'low' }

        const usesMinimalEffort = modelId.includes('gemini-2.5-pro') || modelId.includes('gemini-3')
        return { ...request, reasoningEffort: usesMinimalEffort ? 'minimal' : 'none' }
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
