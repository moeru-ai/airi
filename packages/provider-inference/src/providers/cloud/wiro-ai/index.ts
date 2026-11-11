import { createOpenAI } from '@xsai-ext/providers/create'
import { listModels } from '@xsai/model'
import { array, number, object, optional, parse, string } from 'valibot'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

/** The OpenAI-compatible endpoint of the Wiro AI LLM gateway. The settings page shows it as the default Base URL. */
const WIRO_AI_DEFAULT_BASE_URL = 'https://llm.wiro.ai/v1/'

/** The fields that AIRI reads from one entry of the Wiro AI model list. */
const wiroAIModelSchema = object({
  id: string(),
  name: optional(string()),
  description: optional(string()),
  context_length: optional(number()),
  architecture: optional(object({
    input_modalities: optional(array(string())),
  })),
})

const wiroAIConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(WIRO_AI_DEFAULT_BASE_URL),
})

type WiroAIConfig = z.input<typeof wiroAIConfigSchema>

export const providerWiroAI = defineProvider<WiroAIConfig, 'wiro-ai'>({
  id: 'wiro-ai',
  name: 'Wiro AI',
  nameLocalize: () => 'Wiro AI',
  description: 'wiro.ai',
  descriptionLocalize: () => 'wiro.ai',
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => wiroAIConfigSchema.extend({
    apiKey: wiroAIConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: wiroAIConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },

  extraMethods: {
    listModels: async (config) => {
      const models = await listModels({ apiKey: config.apiKey, baseURL: config.baseUrl ?? WIRO_AI_DEFAULT_BASE_URL })

      return models.map((value) => {
        const model = parse(wiroAIModelSchema, value)
        const inputModalities = model.architecture?.input_modalities

        return {
          id: model.id,
          name: model.name ?? model.id,
          provider: 'wiro-ai',
          description: model.description,
          inputModalities,
          contextLength: model.context_length,
          // The chat vision check reads only this ability. With it, AIRI sends
          // images to the chat model, not to a separate vision model.
          ...(inputModalities?.includes('image') && { metadata: { abilities: { vision: true } } }),
        }
      })
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
