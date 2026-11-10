import type { ChatRequestOptions } from '../../../types'

import { createFireworks } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const fireworksConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.fireworks.ai/inference/v1/'),
})

type FireworksConfig = z.input<typeof fireworksConfigSchema>

export const providerFireworksAI = defineProvider<FireworksConfig, 'fireworks-ai'>({
  id: 'fireworks-ai',
  name: 'Fireworks.ai',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.fireworks.title'),
  description: 'fireworks.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.fireworks.description'),
  tasks: ['chat'],
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-lobe-icons:fireworks',
  iconColor: 'i-lobe-icons:fireworks-color',

  createProviderConfig: ({ t }) => fireworksConfigSchema.extend({
    apiKey: fireworksConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: fireworksConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createFireworks(config.apiKey, config.baseUrl)
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

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
