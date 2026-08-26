import type { ChatRequestOptions } from '../../types'

import { createMoonshotai } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const moonshotConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.moonshot.ai/v1/'),
})

type MoonshotConfig = z.input<typeof moonshotConfigSchema>

export const providerMoonshotAI = defineProvider<MoonshotConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
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
  createProviderConfig: ({ t }) => moonshotConfigSchema.extend({
    apiKey: moonshotConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: moonshotConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'moonshot.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.moonshot.description'),
  icon: 'i-lobe-icons:moonshot',
  id: 'moonshot-ai',
  name: 'Moonshot AI',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.moonshot.title'),
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
