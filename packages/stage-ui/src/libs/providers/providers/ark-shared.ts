import type { ModelInfo } from '../types'

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
  id: string
  contextLength?: number
}

interface ArkProviderDefinitionOptions {
  id: string
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
}

function stripModelPrefix(modelId: string, modelPrefix: string) {
  return modelId.startsWith(modelPrefix)
    ? modelId.slice(modelPrefix.length)
    : modelId
}

export function createArkChatProviderDefinition(options: ArkProviderDefinitionOptions) {
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
  } = options

  return defineProvider({
    id,
    order,
    name,
    nameLocalize: ({ t }) => t(nameKey),
    description,
    descriptionLocalize: ({ t }) => t(descriptionKey),
    tasks: ['chat'],
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
        chat(model: string) {
          return originalChat(stripModelPrefix(model, modelPrefix))
        },
      }
    },

    extraMethods: {
      listModels: async () => models.map((model) => {
        const modelInfo: ModelInfo = {
          id: `${modelPrefix}${model.id}`,
          name: model.id,
          provider: id,
        }
        if (model.contextLength !== undefined) {
          modelInfo.contextLength = model.contextLength
        }
        return modelInfo
      }),
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
