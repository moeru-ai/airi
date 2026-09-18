import type { ChatRequestOptions, ModelInfo } from '../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { listModels } from '@xsai/model'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const arkProviderConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL'),
})

interface ArkModelSpec {
  id: string
  contextLength?: number
  deprecated?: boolean
  descriptionKey?: string
}

interface ArkProviderDefinitionOptions<TId extends string = string> {
  id: TId
  order: number
  name: string
  nameKey: string
  description: string
  descriptionKey: string
  modelPrefix: string
  defaultBaseUrl: string
  icon: string
  iconColor?: string
  models: ArkModelSpec[]
  refreshModelsFromEndpoint?: boolean
}

function stripModelPrefix(modelId: string, modelPrefix: string) {
  return modelId.startsWith(modelPrefix)
    ? modelId.slice(modelPrefix.length)
    : modelId
}

function extractLiveModelId(model: unknown): string {
  if (typeof model === 'string')
    return model
  if (model && typeof (model as { id?: unknown }).id === 'string')
    return (model as { id: string }).id
  return ''
}

export function createArkChatProviderDefinition<const TId extends string>(options: ArkProviderDefinitionOptions<TId>) {
  const {
    id,
    order,
    name,
    nameKey,
    description,
    descriptionKey,
    modelPrefix,
    defaultBaseUrl,
    icon,
    iconColor,
    models,
    refreshModelsFromEndpoint,
  } = options

  return defineProvider({
    id,
    order,
    name,
    nameLocalize: ({ t }) => t(nameKey),
    description,
    descriptionLocalize: ({ t }) => t(descriptionKey),
    tasks: ['chat'],
    capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
    icon,
    iconColor,

    createProviderConfig: ({ t }) => arkProviderConfigSchema.extend({
      apiKey: arkProviderConfigSchema.shape.apiKey.meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
        type: 'password',
      }),
      baseUrl: arkProviderConfigSchema.shape.baseUrl.default(defaultBaseUrl).meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
      }),
    }),
    createProvider(config) {
      const provider = createOpenAI(config.apiKey ?? '', config.baseUrl ?? defaultBaseUrl)
      const originalChat = provider.chat.bind(provider)

      return {
        ...provider,
        chat(model: string, requestOptions?: ChatRequestOptions) {
          const request = originalChat(stripModelPrefix(model, modelPrefix))
          if (!requestOptions?.reasoning)
            return request

          return { ...request, thinking: { type: requestOptions.reasoning } }
        },
      }
    },

    extraMethods: {
      listModels: async (config, _provider, contextOptions) => {
        const staticModels = models.map((model) => {
          const modelInfo: ModelInfo = {
            id: `${modelPrefix}${model.id}`,
            name: model.id,
            provider: id,
          }
          if (model.contextLength !== undefined) {
            modelInfo.contextLength = model.contextLength
          }
          if (model.deprecated !== undefined) {
            modelInfo.deprecated = model.deprecated
          }
          if (model.descriptionKey !== undefined && contextOptions) {
            modelInfo.description = contextOptions.t(model.descriptionKey)
          }
          return modelInfo
        })

        // Refresh the static catalog with models the endpoint actually serves,
        // so newly released coding-plan models appear without a client update.
        // Opt-in per provider: only definitions that set refreshModelsFromEndpoint
        // perform live calls. Any endpoint failure keeps the static catalog untouched.
        const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
        const baseUrl = typeof config.baseUrl === 'string' && config.baseUrl.trim()
          ? config.baseUrl.trim()
          : defaultBaseUrl
        if (!refreshModelsFromEndpoint || !apiKey) {
          return staticModels
        }

        let liveModels: unknown
        // Bound the live refresh so a slow endpoint cannot block model loading.
        // listModels runs while the UI loads provider models. An unbounded wait
        // stalls this provider and delays every provider after it. The timeout
        // aborts the request and the catch below falls back to staticModels.
        const liveRefreshTimeoutMs = 5000
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), liveRefreshTimeoutMs)
        try {
          liveModels = await listModels({ apiKey, baseURL: baseUrl, abortSignal: controller.signal })
        }
        catch {
          return staticModels
        }
        finally {
          clearTimeout(timeout)
        }
        if (!Array.isArray(liveModels)) {
          return staticModels
        }

        const knownIds = new Set(staticModels.map(model => model.id))
        for (const liveModel of liveModels) {
          const rawId = extractLiveModelId(liveModel).trim()
          if (!rawId) {
            continue
          }
          const liveId = rawId.startsWith(modelPrefix) ? rawId : `${modelPrefix}${rawId}`
          if (knownIds.has(liveId)) {
            continue
          }
          knownIds.add(liveId)
          staticModels.push({ id: liveId, name: rawId, provider: id })
        }
        return staticModels
      },
    },
    validationRequiredWhen(config) {
      return !!config.apiKey?.trim()
    },
    validators: {
      ...createOpenAICompatibleValidators({
        checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
        normalizeModelId: modelId => stripModelPrefix(modelId, modelPrefix),
      }),
    },
  })
}
