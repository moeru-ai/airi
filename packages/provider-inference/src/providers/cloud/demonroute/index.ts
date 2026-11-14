import type { ChatRequestOptions } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

export const DEMONROUTE_DEFAULT_BASE_URL = 'https://api.demonroute.com/v1/'

const demonrouteConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(DEMONROUTE_DEFAULT_BASE_URL),
})

type DemonRouteConfig = z.input<typeof demonrouteConfigSchema>

export const providerDemonRoute = defineProvider<DemonRouteConfig, 'demonroute'>({
  id: 'demonroute',
  name: 'DemonRoute',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.demonroute.title'),
  description: 'demonroute.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.demonroute.description'),
  tasks: ['chat'],
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => demonrouteConfigSchema.extend({
    apiKey: demonrouteConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: demonrouteConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey, config.baseUrl || DEMONROUTE_DEFAULT_BASE_URL)
    return {
      ...provider,
      chat(model: string, options?: ChatRequestOptions) {
        const request = provider.chat(model)
        if (!options?.reasoning)
          return request

        return { ...request, chatTemplateKwargs: { enable_thinking: options.reasoning === 'enabled' } }
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
