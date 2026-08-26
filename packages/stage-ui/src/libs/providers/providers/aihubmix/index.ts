import type { ChatRequestOptions } from '../../types'

import { createChatProvider, createEmbedProvider, createModelProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const aihubmixConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://aihubmix.com/v1/'),
})

type AIHubMixConfig = z.input<typeof aihubmixConfigSchema>

export const providerAIHubMix = defineProvider<AIHubMixConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  createProvider(config) {
    const provider = merge(
      createChatProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createEmbedProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
    )

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
  createProviderConfig: ({ t }) => aihubmixConfigSchema.extend({
    apiKey: aihubmixConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: aihubmixConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'AIHubMix',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.aihubmix.description'),
  icon: 'i-lobe-icons:aihubmix',
  iconColor: 'i-lobe-icons:aihubmix-color',
  id: 'aihubmix',
  name: 'AIHubMix',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.aihubmix.title'),

  order: 1,
  tasks: ['chat'],

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
