import type { ChatRequestOptions } from '../../types'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const nvidiaConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://integrate.api.nvidia.com/v1/'),
})

type NvidiaConfig = z.input<typeof nvidiaConfigSchema>

export const providerNvidia = defineProvider<NvidiaConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  createProvider(config) {
    const provider = createOpenAI(config.apiKey, config.baseUrl)
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
  createProviderConfig: ({ t }) => nvidiaConfigSchema.extend({
    apiKey: nvidiaConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: nvidiaConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'build.nvidia.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.nvidia.description'),
  icon: 'i-simple-icons:nvidia',
  id: 'nvidia',
  isAvailableBy: isStageTamagotchi,
  name: 'NVIDIA NIM',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.nvidia.title'),
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
