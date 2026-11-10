import type { ChatRequestOptions } from '../../../types'

import { createMoonshotai } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const moonshotConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.moonshot.ai/v1/'),
})

type MoonshotConfig = z.input<typeof moonshotConfigSchema>

export const providerMoonshotAI = defineProvider<MoonshotConfig, 'moonshot-ai'>({
  id: 'moonshot-ai',
  name: 'Moonshot AI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.moonshot.title'),
  description: 'moonshot.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.moonshot.description'),
  tasks: ['chat'],
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-lobe-icons:moonshot',

  createProviderConfig: ({ t }) => moonshotConfigSchema.extend({
    apiKey: moonshotConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: moonshotConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createMoonshotai(config.apiKey, config.baseUrl)
    return {
      ...provider,
      chat(model: string, options?: ChatRequestOptions) {
        const request = provider.chat(model)
        if (!options?.reasoning)
          return request

        return { ...request, thinking: { type: options.reasoning } }
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
