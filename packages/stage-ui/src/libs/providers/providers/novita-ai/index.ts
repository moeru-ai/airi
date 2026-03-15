import { createNovita } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const novitaConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.novita.ai/openai/'),
})

type NovitaConfig = z.input<typeof novitaConfigSchema>

export const providerNovitaAI = defineProvider<NovitaConfig>({
  id: 'novita-ai',
  name: 'Novita',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.novita.title'),
  description: 'novita.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.novita.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:novita',
  iconColor: 'i-lobe-icons:novita-color',

  createProviderConfig: ({ t }) => novitaConfigSchema.extend({
    apiKey: novitaConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: novitaConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createNovita(config.apiKey, config.baseUrl)
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
