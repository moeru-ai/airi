import type { ModelInfo } from '../../types'

import { createAzure } from '@xsai-ext/providers/special/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const azureAIFoundryConfigSchema = z.object({
  apiKey: z.string('API Key'),
  resourceName: z.string('Resource Name'),
  modelId: z.string('Model ID'),
  apiVersion: z.string('API Version').optional(),
})

type AzureAIFoundryConfig = z.input<typeof azureAIFoundryConfigSchema>

export const providerAzureAIFoundry = defineProvider<AzureAIFoundryConfig>({
  id: 'azure-ai-foundry',
  order: 17,
  name: 'Azure AI Foundry',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.azure-ai-foundry.title'),
  description: 'azure.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.azure-ai-foundry.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:microsoft',

  createProviderConfig: ({ t }) => azureAIFoundryConfigSchema.extend({
    apiKey: azureAIFoundryConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    resourceName: azureAIFoundryConfigSchema.shape.resourceName.meta({
      labelLocalized: 'Resource Name',
      descriptionLocalized: 'Prefix used in https://<prefix>.services.ai.azure.com',
      placeholderLocalized: 'my-resource',
    }),
    modelId: azureAIFoundryConfigSchema.shape.modelId.meta({
      labelLocalized: 'Model ID',
      descriptionLocalized: 'Model ID on Azure AI Foundry',
      placeholderLocalized: 'gpt-4o',
    }),
    apiVersion: azureAIFoundryConfigSchema.shape.apiVersion.meta({
      labelLocalized: 'API Version',
      descriptionLocalized: 'API version for snapshot of the models',
      placeholderLocalized: '2025-04-01-preview',
      section: 'advanced',
    }),
  }),
  createProvider(config) {
    return createAzure({
      apiKey: async () => config.apiKey.trim(),
      resourceName: config.resourceName.trim(),
      apiVersion: config.apiVersion?.trim(),
    }) as any
  },

  extraMethods: {
    listModels: async config =>
      [{
        id: config.modelId,
        name: config.modelId,
        provider: 'azure-ai-foundry',
        description: '',
        contextLength: 0,
        deprecated: false,
      } satisfies ModelInfo],
  },
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
