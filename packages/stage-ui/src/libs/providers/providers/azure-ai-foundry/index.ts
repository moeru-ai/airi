import type { ChatRequestOptions, ModelInfo, ProviderInstance } from '../../types'

import { createAzure } from '@xsai-ext/providers/special/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const azureAIFoundryConfigSchema = z.object({
  apiKey: z.string('API Key'),
  apiVersion: z.string('API Version').optional(),
  modelId: z.string('Model ID'),
  resourceName: z.string('Resource Name'),
})

type AzureAIFoundryConfig = z.input<typeof azureAIFoundryConfigSchema>

export const providerAzureAIFoundry = defineProvider<AzureAIFoundryConfig>({
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  createProvider(config) {
    const provider = createAzure({
      apiKey: async () => config.apiKey.trim(),
      apiVersion: config.apiVersion?.trim(),
      resourceName: config.resourceName.trim(),
    }).then(baseProvider => ({
      ...baseProvider,
      chat(model: string, options?: ChatRequestOptions) {
        const request = baseProvider.chat(model)
        if (!options?.reasoning)
          return request

        return { ...request, reasoningEffort: options.reasoning === 'enabled' ? 'medium' : 'none' }
      },
    }))

    // NOTICE:
    // Azure provider creation resolves its authentication-aware client asynchronously.
    // ProviderDefinition still declares a synchronous result, while the runtime awaits it.
    // Source: @xsai-ext/providers special/create and stores/providers/provider.ts.
    // Remove this cast when ProviderDefinition accepts MaybePromise<ProviderInstance>.
    return provider as unknown as ProviderInstance
  },
  createProviderConfig: ({ t }) => azureAIFoundryConfigSchema.extend({
    apiKey: azureAIFoundryConfigSchema.shape.apiKey.meta({
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    apiVersion: azureAIFoundryConfigSchema.shape.apiVersion.meta({
      descriptionLocalized: 'API version for snapshot of the models',
      labelLocalized: 'API Version',
      placeholderLocalized: '2025-04-01-preview',
      section: 'advanced',
    }),
    modelId: azureAIFoundryConfigSchema.shape.modelId.meta({
      descriptionLocalized: 'Model ID on Azure AI Foundry',
      labelLocalized: 'Model ID',
      placeholderLocalized: 'gpt-4o',
    }),
    resourceName: azureAIFoundryConfigSchema.shape.resourceName.meta({
      descriptionLocalized: 'Prefix used in https://<prefix>.services.ai.azure.com',
      labelLocalized: 'Resource Name',
      placeholderLocalized: 'my-resource',
    }),
  }),
  description: 'azure.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.azure-ai-foundry.description'),
  extraMethods: {
    listModels: async config =>
      [{
        contextLength: 0,
        deprecated: false,
        description: '',
        id: config.modelId,
        name: config.modelId,
        provider: 'azure-ai-foundry',
      } satisfies ModelInfo],
  },
  icon: 'i-lobe-icons:microsoft',
  id: 'azure-ai-foundry',
  name: 'Azure AI Foundry',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.azure-ai-foundry.title'),
  order: 17,

  tasks: ['chat'],
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim() || !!config.resourceName?.trim() || !!config.modelId?.trim()
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'azure-ai-foundry:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const resourceName = typeof config.resourceName === 'string' ? config.resourceName.trim() : ''
          const modelId = typeof config.modelId === 'string' ? config.modelId.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })
          if (!resourceName)
            errors.push({ error: new Error('Resource name is required.') })
          if (!modelId)
            errors.push({ error: new Error('Model ID is required.') })

          return {
            errors,
            reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },
})
