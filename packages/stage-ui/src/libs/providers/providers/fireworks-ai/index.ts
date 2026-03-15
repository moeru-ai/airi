import { createFireworks } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const fireworksConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.fireworks.ai/inference/v1/'),
})

type FireworksConfig = z.input<typeof fireworksConfigSchema>

export const providerFireworksAI = defineProvider<FireworksConfig>({
  id: 'fireworks-ai',
  name: 'Fireworks.ai',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.fireworks.title'),
  description: 'fireworks.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.fireworks.description'),
  tasks: ['chat'],
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
    return createFireworks(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity', 'model_list'],
    }),
  },
})
