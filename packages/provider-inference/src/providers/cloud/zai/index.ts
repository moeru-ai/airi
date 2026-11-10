import type { ChatRequestOptions } from '../../../types'

import { createZai } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const zaiConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.z.ai/api/paas/v4'),
})

type ZaiConfig = z.input<typeof zaiConfigSchema>

export const providerZai = defineProvider<ZaiConfig, 'zai'>({
  id: 'zai',
  name: 'Z.ai',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.zai.title'),
  description: 'z.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.zai.description'),
  tasks: ['chat'],
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-lobe-icons:zai',

  createProviderConfig: ({ t }) => zaiConfigSchema.extend({
    apiKey: zaiConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: zaiConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createZai(config.apiKey, config.baseUrl)
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
