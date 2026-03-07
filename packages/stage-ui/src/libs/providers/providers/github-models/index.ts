import { createGithubModels } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const DEFAULT_GITHUB_MODELS_BASE_URL = 'https://models.github.ai/inference'
const githubModelsConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1),
  baseUrl: z
    .string()
    .optional()
    .default(DEFAULT_GITHUB_MODELS_BASE_URL),
})

type GitHubModelsConfig = z.input<typeof githubModelsConfigSchema>
const githubModelsValidators = createOpenAICompatibleValidators<GitHubModelsConfig>({
  checks: ['connectivity', 'model_list'],
}) ?? {}

function withDefaultBaseUrl<TConfig extends { baseUrl?: string }>(config: TConfig): TConfig & { baseUrl: string } {
  return {
    ...config,
    baseUrl: config.baseUrl || DEFAULT_GITHUB_MODELS_BASE_URL,
  }
}

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
    return createGithubModels(config.apiKey, config.baseUrl || DEFAULT_GITHUB_MODELS_BASE_URL)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    validateConfig: githubModelsValidators.validateConfig?.map(validatorFactory => (contextOptions) => {
      const originalValidator = validatorFactory(contextOptions)

      return {
        ...originalValidator,
        validator: (config, context) => originalValidator.validator(withDefaultBaseUrl(config), context),
      }
    }),
    validateProvider: githubModelsValidators.validateProvider?.map(validatorFactory => (contextOptions) => {
      const originalValidator = validatorFactory(contextOptions)

      return {
        ...originalValidator,
        validator: (config, provider, providerExtra, context) =>
          originalValidator.validator(withDefaultBaseUrl(config), provider, providerExtra, context),
      }
    }),
  },
})
