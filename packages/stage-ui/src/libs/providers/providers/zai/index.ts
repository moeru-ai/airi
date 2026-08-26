import type { ChatRequestOptions } from '../../types'

import { createZai } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const zaiConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.z.ai/api/paas/v4'),
})

type ZaiConfig = z.input<typeof zaiConfigSchema>

export const providerZai = defineProvider<ZaiConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
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
  createProviderConfig: ({ t }) => zaiConfigSchema.extend({
    apiKey: zaiConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: zaiConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'z.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.zai.description'),
  icon: 'i-lobe-icons:zai',
  id: 'zai',
  name: 'Z.ai',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.zai.title'),
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
