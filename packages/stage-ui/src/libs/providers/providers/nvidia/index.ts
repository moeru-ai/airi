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
  id: 'nvidia',
  name: 'NVIDIA NIM',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.nvidia.title'),
  description: 'build.nvidia.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.nvidia.description'),
  tasks: ['chat'],
  icon: 'i-simple-icons:nvidia',
  isAvailableBy: isStageTamagotchi,

  createProviderConfig: ({ t }) => nvidiaConfigSchema.extend({
    apiKey: nvidiaConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: nvidiaConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
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
