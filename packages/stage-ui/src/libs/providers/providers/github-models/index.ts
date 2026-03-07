import { createGithubModels } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const githubModelsConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://models.github.ai/inference'),
})

type GitHubModelsConfig = z.input<typeof githubModelsConfigSchema>

export const providerGitHubModels = defineProvider<GitHubModelsConfig>({
  id: 'github-models',
  order: 2,
  name: 'GitHub Models',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.github-models.title'),
  description: 'models.github.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.github-models.description'),
  tasks: ['chat'],
  icon: 'i-simple-icons:github',

  createProviderConfig: ({ t }) => githubModelsConfigSchema.extend({
    apiKey: githubModelsConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: githubModelsConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createGithubModels(config.apiKey, config.baseUrl)
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
