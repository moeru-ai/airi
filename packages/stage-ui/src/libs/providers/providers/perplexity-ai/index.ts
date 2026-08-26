import type { ModelInfo } from '../../types'

import { createPerplexity } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const perplexityConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.perplexity.ai/'),
})

type PerplexityConfig = z.input<typeof perplexityConfigSchema>

export const providerPerplexityAI = defineProvider<PerplexityConfig>({
  createProvider(config) {
    return createPerplexity(config.apiKey, config.baseUrl)
  },
  createProviderConfig: ({ t }) => perplexityConfigSchema.extend({
    apiKey: perplexityConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: perplexityConfigSchema.shape.baseUrl.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  description: 'perplexity.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.perplexity.description'),
  extraMethods: {
    async listModels() {
      return [
        {
          contextLength: 127072,
          description: 'Lightweight, cost-effective search model with grounding.',
          id: 'sonar',
          name: 'Sonar',
          provider: 'perplexity-ai',
        },
        {
          contextLength: 200000,
          description: 'Advanced search offering with grounding, supporting complex queries and follow-ups.',
          id: 'sonar-pro',
          name: 'Sonar Pro',
          provider: 'perplexity-ai',
        },
        {
          contextLength: 127072,
          description: 'Precise reasoning offering with Chain of Thought (CoT).',
          id: 'sonar-reasoning-pro',
          name: 'Sonar Reasoning Pro',
          provider: 'perplexity-ai',
        },
        {
          contextLength: 200000,
          description: 'Expert-level research model conducting exhaustive searches and generating comprehensive reports.',
          id: 'sonar-deep-research',
          name: 'Sonar Deep Research',
          provider: 'perplexity-ai',
        },
      ] satisfies ModelInfo[]
    },
  },
  icon: 'i-lobe-icons:perplexity',
  iconColor: 'i-lobe-icons:perplexity-color',
  id: 'perplexity-ai',

  name: 'Perplexity',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.perplexity.title'),

  tasks: ['chat'],
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
