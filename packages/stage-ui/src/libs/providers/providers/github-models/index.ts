import type { ModelInfo } from '../../types'

import { createGithubModels } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const DEFAULT_GITHUB_MODELS_BASE_URL = 'https://models.github.ai/inference'
const GITHUB_MODELS_CATALOG_URL = 'https://models.github.ai/catalog/models'
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

interface GitHubCatalogModel {
  id: string
  name?: string
  summary?: string
  description?: string
  capabilities?: string[]
  limits?: {
    max_input_tokens?: number
  }
}

function normalizeGitHubCatalogModels(payload: unknown): GitHubCatalogModel[] {
  if (Array.isArray(payload)) {
    return payload as GitHubCatalogModel[]
  }

  if (payload && typeof payload === 'object') {
    const anyPayload = payload as { items?: unknown, models?: unknown }
    if (Array.isArray(anyPayload.items)) {
      return anyPayload.items as GitHubCatalogModel[]
    }
    if (Array.isArray(anyPayload.models)) {
      return anyPayload.models as GitHubCatalogModel[]
    }
  }

  return []
}

async function listGitHubCatalogModels(config: GitHubModelsConfig): Promise<ModelInfo[]> {
  const apiKey = config.apiKey?.trim()
  if (!apiKey) {
    return []
  }

  const response = await fetch(GITHUB_MODELS_CATALOG_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const detail = (await response.text()).trim() || response.statusText || 'Unknown error.'
    throw new Error(`Remote sent ${response.status} response: ${detail}`)
  }

  const models = normalizeGitHubCatalogModels(await response.json())
  return models
    .filter(model => typeof model.id === 'string' && model.id.length > 0)
    .map(model => ({
      id: model.id,
      name: model.name || model.id,
      provider: 'github-models',
      description: model.summary || model.description || '',
      capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
      contextLength: typeof model.limits?.max_input_tokens === 'number' ? model.limits.max_input_tokens : undefined,
      deprecated: false,
    }))
}

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
      descriptionLocalized: t('settings.pages.providers.provider.github-models.fields.field.baseUrl.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
      section: 'advanced',
    }),
  }),
  createProvider(config) {
    return createGithubModels(config.apiKey, config.baseUrl || DEFAULT_GITHUB_MODELS_BASE_URL)
  },
  extraMethods: {
    listModels: config => listGitHubCatalogModels(withDefaultBaseUrl(config)),
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
