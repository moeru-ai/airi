import type { ModelInfo } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

export const CLOUDGPU_DEFAULT_BASE_URL = 'https://cloudgpu.app/v1/'

const cloudgpuConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(CLOUDGPU_DEFAULT_BASE_URL),
})

type CloudgpuConfig = z.input<typeof cloudgpuConfigSchema>

interface CloudgpuModel {
  id: string
  name?: string
}

/**
 * Id parts that name a non-chat task.
 *
 * The catalog has no capability field. An id is not a chat model when it
 * contains one of these parts. Image models in this catalog use `flux`.
 * Speech models use `whisper` or `asr`.
 */
const NON_CHAT_MODEL_ID_PARTS = [
  'embedding',
  'rerank',
  'image',
  'audio',
  'speech',
  'tts',
  'transcription',
  'flux',
  'whisper',
  'asr',
]

function isChatModel(model: CloudgpuModel): boolean {
  const id = model.id.toLowerCase()
  return NON_CHAT_MODEL_ID_PARTS.every(part => !id.includes(part))
}

/**
 * Keeps chat models from a CloudGPU model list.
 *
 * @example
 * toCloudgpuChatModels([{ id: 'deepseek-v4.1-flash' }, { id: 'kokoro-tts' }])
 * // => [{ id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash', provider: 'cloudgpu' }]
 */
export function toCloudgpuChatModels(models: CloudgpuModel[]): ModelInfo[] {
  return models
    .filter(isChatModel)
    .map(model => ({
      id: model.id,
      name: model.name || model.id,
      provider: 'cloudgpu',
    }))
}

export const providerCloudgpu = defineProvider<CloudgpuConfig, 'cloudgpu'>({
  id: 'cloudgpu',
  name: 'CloudGPU',
  nameLocalize: () => 'CloudGPU',
  description: 'OpenAI-compatible model API and GPU cloud',
  descriptionLocalize: () => 'OpenAI-compatible model API and GPU cloud',
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',

  createProviderConfig: ({ t }) => cloudgpuConfigSchema.extend({
    apiKey: cloudgpuConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: cloudgpuConfigSchema.shape.baseUrl.meta({
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
      const baseUrl = (config.baseUrl || CLOUDGPU_DEFAULT_BASE_URL).replace(/\/?$/, '/')
      const response = await fetch(`${baseUrl}models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })
      if (!response.ok)
        throw new Error(`Failed to list CloudGPU models: ${response.status} ${response.statusText}`)

      const body = await response.json() as { data?: CloudgpuModel[] }
      return toCloudgpuChatModels(body.data ?? [])
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
