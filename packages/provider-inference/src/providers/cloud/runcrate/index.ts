import type { ModelInfo } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

export const RUNCRATE_DEFAULT_BASE_URL = 'https://api.runcrate.ai/v1/'

const runcrateConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(RUNCRATE_DEFAULT_BASE_URL),
})

type RuncrateConfig = z.input<typeof runcrateConfigSchema>

interface RuncrateModel {
  id: string
  name?: string
  input_modalities?: string[]
  output_modalities?: string[]
  context_length?: number
}

/**
 * Runcrate's `/models` also lists image, video, speech and embedding models.
 * Keep the text-out models with a context window, so model pickers and the
 * chat validation probe only see chat models. Declared image input is also
 * written to `metadata.abilities.vision`, which the chat vision check reads.
 */
export function toRuncrateChatModels(models: RuncrateModel[]): ModelInfo[] {
  return models
    .filter(model => model.output_modalities?.length === 1 && model.output_modalities[0] === 'text' && (model.context_length ?? 0) > 0)
    .map(model => ({
      id: model.id,
      name: model.name || model.id,
      provider: 'runcrate',
      inputModalities: model.input_modalities,
      contextLength: model.context_length,
      ...(model.input_modalities?.includes('image') && { metadata: { abilities: { vision: true } } }),
    }))
}

export const providerRuncrate = defineProvider<RuncrateConfig, 'runcrate'>({
  id: 'runcrate',
  name: 'Runcrate',
  nameLocalize: () => 'Runcrate',
  description: 'runcrate.ai',
  descriptionLocalize: () => 'runcrate.ai',
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => runcrateConfigSchema.extend({
    apiKey: runcrateConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: runcrateConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },

  extraMethods: {
    async listModels(config) {
      const baseUrl = (config.baseUrl || RUNCRATE_DEFAULT_BASE_URL).replace(/\/?$/, '/')
      const response = await fetch(`${baseUrl}models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })
      if (!response.ok)
        throw new Error(`Failed to list Runcrate models: ${response.status} ${response.statusText}`)

      const body = await response.json() as { data?: RuncrateModel[] }
      return toRuncrateChatModels(body.data ?? [])
    },
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
