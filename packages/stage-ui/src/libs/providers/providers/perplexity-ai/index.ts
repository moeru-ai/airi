import type { ModelInfo } from '../../types'

import { createPerplexity } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
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
  id: 'perplexity-ai',
  name: 'Perplexity',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.perplexity.title'),
  description: 'perplexity.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.perplexity.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:perplexity',
  iconColor: 'i-lobe-icons:perplexity-color',

  createProviderConfig: ({ t }) => perplexityConfigSchema.extend({
    apiKey: perplexityConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: perplexityConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createPerplexity(config.apiKey, config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  extraMethods: {
    async listModels() {
      return [
        {
          id: 'sonar',
          name: 'Sonar',
          provider: 'perplexity-ai',
          description: 'Lightweight, cost-effective search model with grounding.',
          contextLength: 127072,
        },
        {
          id: 'sonar-pro',
          name: 'Sonar Pro',
          provider: 'perplexity-ai',
          description: 'Advanced search offering with grounding, supporting complex queries and follow-ups.',
          contextLength: 200000,
        },
        {
          id: 'sonar-reasoning-pro',
          name: 'Sonar Reasoning Pro',
          provider: 'perplexity-ai',
          description: 'Precise reasoning offering with Chain of Thought (CoT).',
          contextLength: 127072,
        },
        {
          id: 'sonar-deep-research',
          name: 'Sonar Deep Research',
          provider: 'perplexity-ai',
          description: 'Expert-level research model conducting exhaustive searches and generating comprehensive reports.',
          contextLength: 200000,
        },
      ] satisfies ModelInfo[]
    },
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity'],
    }),
  },
})
