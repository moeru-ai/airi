import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const AZURE_OPENAI_PROVIDER_ID = 'azure-openai' as const
const DEFAULT_COMPLETIONS_API_VERSION = '2024-04-01-preview'
const DEFAULT_AZURE_BASE_URL = 'https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com/openai/'
const FALLBACK_AZURE_ORIGIN = 'https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com'
const DEFAULT_AZURE_OPENAI_COMPATIBLE_BASE_URL = `${FALLBACK_AZURE_ORIGIN}/openai/v1`

const azureOpenAIConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(DEFAULT_AZURE_BASE_URL),
  completionsApiVersion: z
    .string('Completions API Version')
    .optional()
    .default(DEFAULT_COMPLETIONS_API_VERSION),
  manualModels: z
    .string('Manual Models')
    .optional()
    .default(''),
})

type AzureOpenAIConfig = z.input<typeof azureOpenAIConfigSchema>

interface AzureEndpointHints {
  origin: string
  completionsUrl?: string
  completionsDeployment?: string
  apiVersionFromUrl?: string
}

function resolveProviderBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return DEFAULT_AZURE_OPENAI_COMPATIBLE_BASE_URL
  }

  try {
    const parsed = new URL(trimmed)
    if (/\/openai\/deployments\/[^/]+\/chat\/completions\/?$/i.test(parsed.pathname) || /^\/openai\/?$/i.test(parsed.pathname)) {
      return `${parsed.origin}/openai/v1`
    }
  }
  catch {
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

function parseAzureEndpointHints(baseUrl: string | undefined): AzureEndpointHints {
  const raw = (baseUrl || '').trim()
  if (!raw) {
    return { origin: FALLBACK_AZURE_ORIGIN }
  }

  try {
    const parsed = new URL(raw)
    const apiVersionFromUrl = parsed.searchParams.get('api-version')?.trim()

    const deploymentMatch = parsed.pathname.match(/\/openai\/deployments\/([^/]+)\/chat\/completions\/?$/i)
    if (deploymentMatch?.[1]) {
      return {
        origin: parsed.origin,
        completionsUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
        completionsDeployment: decodeURIComponent(deploymentMatch[1]),
        apiVersionFromUrl,
      }
    }

    return {
      origin: parsed.origin,
      apiVersionFromUrl,
    }
  }
  catch {
    return { origin: FALLBACK_AZURE_ORIGIN }
  }
}

function resolveCompletionsApiVersion(config: AzureOpenAIConfig, hints: AzureEndpointHints): string {
  return (hints.apiVersionFromUrl || config.completionsApiVersion || DEFAULT_COMPLETIONS_API_VERSION).trim()
}

function parseManualModels(input: unknown): string[] {
  if (typeof input !== 'string') {
    return []
  }

  const models = input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return [...new Set(models)]
}

function resolveConfiguredDeployments(config: AzureOpenAIConfig): string[] {
  const endpointHints = parseAzureEndpointHints(config.baseUrl)
  const manualModels = parseManualModels(config.manualModels)
  return [...new Set([endpointHints.completionsDeployment, ...manualModels].filter(Boolean) as string[])]
}

function mapChatBodyToCompletions(body: any): Record<string, unknown> {
  const mappedBody: Record<string, unknown> = {
    ...body,
    messages: body?.messages,
    max_completion_tokens: body?.max_completion_tokens ?? body?.max_output_tokens ?? body?.max_tokens,
  }

  delete mappedBody.input
  delete mappedBody.max_output_tokens

  return mappedBody
}

function createAzureOpenAIFetch(config: AzureOpenAIConfig) {
  const endpointHints = parseAzureEndpointHints(config.baseUrl)
  const completionsApiVersion = resolveCompletionsApiVersion(config, endpointHints)
  const apiKey = (config.apiKey || '').trim()

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const isChatCompletionsCall = request.method.toUpperCase() === 'POST' && /\/chat\/completions\/?$/i.test(url.pathname)

    if (!isChatCompletionsCall) {
      return fetch(request)
    }

    const requestBody = await request.clone().json().catch(() => null)
    if (!requestBody) {
      return fetch(request)
    }

    const deployment = endpointHints.completionsDeployment || (typeof requestBody?.model === 'string' ? requestBody.model.trim() : '')
    if (!deployment) {
      return fetch(request)
    }

    const completionsUrl = endpointHints.completionsUrl
      ? new URL(endpointHints.completionsUrl)
      : new URL(`${endpointHints.origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`)

    if (!completionsUrl.searchParams.get('api-version')) {
      completionsUrl.searchParams.set('api-version', completionsApiVersion)
    }

    const headers = new Headers(request.headers)
    headers.set('api-key', apiKey)
    headers.set('content-type', 'application/json')

    const mappedBody = mapChatBodyToCompletions(requestBody)
    return fetch(completionsUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(mappedBody),
      signal: request.signal,
    })
  }
}

export const providerAzureOpenAI = defineProvider<AzureOpenAIConfig>({
  id: 'azure-openai',
  order: 2,
  name: 'Azure OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.azure-openai.title'),
  description: 'Azure OpenAI API',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.azure-openai.description'),
  tasks: ['chat'],
  icon: 'i-simple-icons:microsoftazure',
  extraMethods: {
    listModels: async (config, _provider) => {
      return resolveConfiguredDeployments(config).map(model => ({
        id: model,
        name: model,
        provider: AZURE_OPENAI_PROVIDER_ID,
        description: 'Azure deployment',
      }))
    },
  },

  createProviderConfig: ({ t }) => azureOpenAIConfigSchema.extend({
    apiKey: azureOpenAIConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: azureOpenAIConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: 'Azure endpoint or full Chat Completions URL. Full URL is recommended.',
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    completionsApiVersion: azureOpenAIConfigSchema.shape.completionsApiVersion.meta({
      labelLocalized: 'Completions API Version',
      descriptionLocalized: 'Used for Azure Chat Completions API requests.',
      placeholderLocalized: '2024-04-01-preview',
      section: 'advanced',
    }),
    manualModels: azureOpenAIConfigSchema.shape.manualModels.meta({
      labelLocalized: 'Manual Models',
      descriptionLocalized: 'Optional. Comma-separated model/deployment names used as fallback in model selection.',
      placeholderLocalized: 'gpt-5.2-chat, gpt-4.1',
      section: 'advanced',
    }),
  }),
  createProvider(config) {
    const normalizedBaseUrl = resolveProviderBaseUrl(config.baseUrl || DEFAULT_AZURE_BASE_URL)
    const provider = createOpenAI(config.apiKey || '', normalizedBaseUrl) as any
    const fetch = createAzureOpenAIFetch(config)

    return {
      ...provider,
      model: (...args: any[]) => ({
        ...provider.model(...args),
        fetch,
      }),
      chat: (...args: any[]) => ({
        ...provider.chat(...args),
        fetch,
      }),
      embed: (...args: any[]) => ({
        ...provider.embed(...args),
        fetch,
      }),
      image: (...args: any[]) => ({
        ...provider.image(...args),
        fetch,
      }),
      speech: (...args: any[]) => ({
        ...provider.speech(...args),
        fetch,
      }),
      transcription: (...args: any[]) => ({
        ...provider.transcription(...args),
        fetch,
      }),
    }
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'azure-openai:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })

          if (!baseUrl) {
            errors.push({ error: new Error('Base URL is required.') })
          }
          else {
            try {
              const parsed = new URL(baseUrl)
              if (!parsed.host)
                errors.push({ error: new Error('Base URL is not absolute. Check your input.') })
            }
            catch {
              errors.push({ error: new Error('Base URL is invalid. It must be an absolute URL.') })
            }
          }

          return {
            errors,
            reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
    validateProvider: [
      ({ t }) => ({
        id: 'azure-openai:check-completions-connectivity',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []

          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrlRaw = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
          const endpointHints = parseAzureEndpointHints(baseUrlRaw)
          const completionsApiVersion = resolveCompletionsApiVersion(config as AzureOpenAIConfig, endpointHints)
          const manualModels = parseManualModels((config as AzureOpenAIConfig).manualModels)
          const deployment = endpointHints.completionsDeployment || manualModels[0] || ''

          if (!apiKey || !baseUrlRaw) {
            return {
              errors: [{ error: new Error('API key and Base URL are required.') }],
              reason: 'API key and Base URL are required.',
              reasonKey: '',
              valid: false,
            }
          }

          if (!deployment) {
            return {
              errors: [{ error: new Error('Deployment / Model is required for Azure Chat Completions connectivity check.') }],
              reason: 'Deployment / Model is required for Azure Chat Completions connectivity check.',
              reasonKey: '',
              valid: false,
            }
          }

          try {
            const completionsUrl = endpointHints.completionsUrl
              ? new URL(endpointHints.completionsUrl)
              : new URL(`${endpointHints.origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`)

            if (!completionsUrl.searchParams.get('api-version')) {
              completionsUrl.searchParams.set('api-version', completionsApiVersion)
            }

            const response = await fetch(completionsUrl.toString(), {
              method: 'POST',
              headers: {
                'api-key': apiKey,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: deployment,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              }),
            })

            if (response.status >= 400) {
              const responseText = await response.text()

              if (response.status === 400) {
                return {
                  errors,
                  reason: '',
                  reasonKey: '',
                  valid: true,
                }
              }

              if (response.status === 401 || response.status === 403) {
                errors.push({ error: new Error(`Authentication failed (${response.status}). Check API key / endpoint. Response: ${responseText || 'empty'}`) })
              }
              else if (response.status === 404) {
                errors.push({ error: new Error(`Deployment or endpoint not found (${response.status}). Check Base URL, Deployment / Model, and API version. Response: ${responseText || 'empty'}`) })
              }
              else if (response.status >= 500) {
                errors.push({ error: new Error(`Server error (${response.status}). Response: ${responseText || 'empty'}`) })
              }
              else {
                errors.push({ error: new Error(`Completions connectivity check returned ${response.status}. Response: ${responseText || 'empty'}`) })
              }
            }
          }
          catch (error) {
            errors.push({ error: new Error(`Connectivity check failed: ${(error as Error).message}`) })
          }

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
