import type { ChatRequestOptions } from '../../types'

import { createGoogleGenerativeAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const googleGenerativeConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://generativelanguage.googleapis.com/v1beta/openai/'),
})

type GoogleGenerativeConfig = z.input<typeof googleGenerativeConfigSchema>

export const providerGoogleGenerativeAI = defineProvider<GoogleGenerativeConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  createProvider(config) {
    const provider = createGoogleGenerativeAI(config.apiKey, config.baseUrl)
    return {
      ...provider,
      chat(model: string, options?: ChatRequestOptions) {
        const request = provider.chat(model)
        if (!options?.reasoning)
          return request

        return { ...request, reasoningEffort: options.reasoning === 'enabled' ? 'medium' : 'none' }
      },
    }
  },
  createProviderConfig: ({ t }) => googleGenerativeConfigSchema.extend({
    apiKey: googleGenerativeConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: googleGenerativeConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'ai.google.dev',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.google-generative-ai.description'),
  icon: 'i-lobe-icons:gemini',
  iconColor: 'i-lobe-icons:gemini-color',
  id: 'google-generative-ai',
  name: 'Google Gemini',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.google-generative-ai.title'),

  order: 8,
  tasks: ['chat'],

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
