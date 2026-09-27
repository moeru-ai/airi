import type { ChatRequestOptions, ModelInfo, ModelMetadata } from '../../../types'

import { createChatProvider, createModelProvider, merge } from '@xsai-ext/providers/utils'
import { listModels } from '@xsai/model'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

/** Chutes serves every public LLM chute behind one OpenAI-compatible gateway. */
export const CHUTES_LLM_BASE_URL = 'https://llm.chutes.ai/v1/'

const chutesConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(CHUTES_LLM_BASE_URL),
})

type ChutesConfig = z.input<typeof chutesConfigSchema>

/**
 * Model entry returned by `GET /v1/models` on the Chutes gateway.
 *
 * Chutes extends the OpenAI list shape with routing, modality, feature, and
 * pricing fields. Every extension is optional because older chutes, such as
 * `unsloth/Mistral-Nemo-Instruct-2407-TEE`, omit them.
 */
const chutesModelSchema = z.object({
  id: z.string(),
  context_length: z.number().optional(),
  max_output_length: z.number().optional(),
  input_modalities: z.array(z.string()).optional(),
  supported_features: z.array(z.string()).optional(),
  /** USD per million tokens. The sibling `price` field repeats these rates in TAO and USD. */
  pricing: z.object({
    prompt: z.number().optional(),
    completion: z.number().optional(),
    input_cache_read: z.number().optional(),
  }).optional(),
  confidential_compute: z.boolean().optional(),
})

type ChutesModel = z.infer<typeof chutesModelSchema>

/**
 * Converts one Chutes model entry into AIRI model metadata.
 *
 * The chat store reads `abilities.vision` to send images to the model directly
 * instead of describing them through the separate vision module first.
 *
 * @example
 * toModelMetadata({ id: 'Qwen/Qwen3.6-27B-TEE', input_modalities: ['text', 'image'], supported_features: ['tools'], pricing: { prompt: 0.3, completion: 2 } })
 * // => { abilities: { vision: true, video: false, functionCall: true, reasoning: false, structuredOutput: false }, pricing: { currency: 'USD', units: [...] } }
 *
 * toModelMetadata({ id: 'Nemotron-3-Nano-Omni-30B-TEE' })
 * // => undefined
 */
function toModelMetadata(model: ChutesModel): ModelMetadata | undefined {
  const metadata: ModelMetadata = {}

  // Some legacy chutes omit both capability lists. Missing lists mean "unknown", not
  // "unsupported", so abilities stay absent instead of claiming the model lacks tools or vision.
  if (model.input_modalities || model.supported_features) {
    const inputs = model.input_modalities ?? []
    const features = model.supported_features ?? []
    metadata.abilities = {
      vision: inputs.includes('image'),
      video: inputs.includes('video'),
      functionCall: features.includes('tools'),
      reasoning: features.includes('reasoning'),
      structuredOutput: features.includes('structured_outputs'),
    }
  }

  if (model.max_output_length)
    metadata.maxOutput = model.max_output_length

  const rates = [
    { name: 'textInput', rate: model.pricing?.prompt },
    { name: 'textOutput', rate: model.pricing?.completion },
    { name: 'textInput_cacheRead', rate: model.pricing?.input_cache_read },
  ] as const
  const units = rates
    .filter((unit): unit is typeof unit & { rate: number } => typeof unit.rate === 'number')
    .map(unit => ({ name: unit.name, rate: unit.rate, strategy: 'fixed' as const, unit: 'millionTokens' as const }))
  if (units.length > 0)
    metadata.pricing = { currency: 'USD', units }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

/**
 * Chutes LLM gateway provider.
 *
 * Chat requests and the model list share `baseUrl`. The model list is public,
 * but chat requests require a `cpk_` API key. Vision is handled by the same
 * chat endpoint for models whose `input_modalities` include `image`.
 */
export const providerChutesAI = defineProvider<ChutesConfig, 'chutes-ai'>({
  id: 'chutes-ai',
  name: 'Chutes',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.chutes.title'),
  description: 'chutes.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.chutes.description'),
  tasks: ['chat'],
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  icon: 'i-ph:parachute-duotone',

  createProviderConfig: ({ t }) => chutesConfigSchema.extend({
    apiKey: chutesConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: chutesConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const options = { apiKey: config.apiKey, baseURL: config.baseUrl || CHUTES_LLM_BASE_URL }
    const provider = merge(createChatProvider(options), createModelProvider(options))
    return {
      ...provider,
      chat(model: string, requestOptions?: ChatRequestOptions) {
        const request = provider.chat(model)
        if (!requestOptions?.reasoning)
          return request

        // Chutes passes `chat_template_kwargs` to the chat template. Qwen reads `enable_thinking`;
        // Kimi, GLM, and DeepSeek read `thinking`. Sending both does not depend on the gateway
        // copying one key to the other (chutes-api `api/invocation/router.py`).
        // The gateway ignores top-level `reasoning` and `reasoning_effort`.
        const enabled = requestOptions.reasoning === 'enabled'
        return { ...request, chatTemplateKwargs: { enable_thinking: enabled, thinking: enabled } }
      },
    }
  },

  extraMethods: {
    listModels: async (config) => {
      const discovered = await listModels({ apiKey: config.apiKey, baseURL: config.baseUrl || CHUTES_LLM_BASE_URL })
      return discovered.map((value): ModelInfo => {
        const model = chutesModelSchema.parse(value)
        const metadata = toModelMetadata(model)
        return {
          id: model.id,
          name: model.id,
          provider: 'chutes-ai',
          ...(model.context_length ? { contextLength: model.context_length } : {}),
          ...(metadata ? { metadata } : {}),
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
