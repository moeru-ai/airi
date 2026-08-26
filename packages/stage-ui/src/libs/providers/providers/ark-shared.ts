import type { ChatRequestOptions, ModelInfo } from '../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../types'
import { createOpenAICompatibleValidators } from '../validators'
import { defineProvider } from './registry'

const arkProviderConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL'),
})

interface ArkModelSpec {
  contextLength?: number
  deprecated?: boolean
  descriptionKey?: string
  id: string
}

interface ArkProviderDefinitionOptions {
  defaultBaseUrl: string
  description: string
  descriptionKey: string
  icon: string
  iconColor?: string
  id: string
  modelPrefix: string
  models: ArkModelSpec[]
  name: string
  nameKey: string
  order: number
}

export function createArkChatProviderDefinition(options: ArkProviderDefinitionOptions) {
  const {
    defaultBaseUrl,
    description,
    descriptionKey,
    icon,
    iconColor,
    id,
    modelPrefix,
    models,
    name,
    nameKey,
    order,
  } = options

  return defineProvider({
    capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
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
    createProviderConfig: ({ t }) => arkProviderConfigSchema.extend({
      apiKey: arkProviderConfigSchema.shape.apiKey.meta({
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
        type: 'password',
      }),
      baseUrl: arkProviderConfigSchema.shape.baseUrl.default(defaultBaseUrl).meta({
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
      }),
    }),
    description,
    descriptionLocalize: ({ t }) => t(descriptionKey),
    extraMethods: {
      listModels: async (_config, _provider, contextOptions) => models.map((model) => {
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
      }),
    },
    icon,
    iconColor,
    id,
    name,

    nameLocalize: ({ t }) => t(nameKey),
    order,

    tasks: ['chat'],
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

function stripModelPrefix(modelId: string, modelPrefix: string) {
  return modelId.startsWith(modelPrefix)
    ? modelId.slice(modelPrefix.length)
    : modelId
}
