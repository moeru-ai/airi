import type { ProviderDefinition, ProviderExtraMethods, ProviderInstance } from '../types'

import isNetworkError from 'is-network-error'

import { errorMessageFrom } from '@moeru/std'
import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'
import { Mutex } from 'es-toolkit'

import { isModelProvider } from '../types'

type OpenAICompatibleValidationCheck = 'connectivity' | 'model_list' | 'chat_completions'

interface OpenAICompatibleValidationOptions<TConfig extends { apiKey?: string, baseUrl?: string }> {
  checks?: OpenAICompatibleValidationCheck[]
  additionalHeaders?: Record<string, string>
  schedule?: {
    mode: 'once' | 'interval'
    intervalMs?: number
  }
  connectivityFailureReason?: (input: { config: TConfig, error: unknown, errorMessage: string }) => string
  modelListFailureReason?: (input: { config: TConfig, error: unknown, errorMessage: string }) => string
}

function extractStatusCode(error: unknown): number | null {
  if (!error)
    return null

  const anyError = error as {
    cause?: {
      status?: unknown
      statusCode?: unknown
      response?: { status?: unknown }
    }
  }

  const candidates = [
    anyError.cause?.status,
    anyError.cause?.statusCode,
    anyError.cause?.response?.status,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number')
      return candidate
  }

  return null
}

function extractModelId(model: any): string {
  if (!model)
    return ''
  if (typeof model === 'string')
    return model
  if (typeof model.id === 'string')
    return model.id

  return ''
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function resolveModels<TConfig extends { apiKey?: string | null, baseUrl?: string | URL | null }>(
  config: TConfig,
  provider: ProviderInstance,
  providerExtra: ProviderExtraMethods<TConfig> | undefined,
) {
  if (providerExtra?.listModels) {
    return providerExtra.listModels(config, provider)
  }
  if (!isModelProvider(provider)) {
    return listModels({ baseURL: config.baseUrl!, apiKey: config.apiKey! })
  }

  return listModels(provider.model())
}

function getConfiguredValidationModel<TConfig extends { model?: unknown }>(config: TConfig): string {
  const configuredModel = normalizeString(config.model)
  return extractModelId(configuredModel)
}

export function createOpenAICompatibleValidators<TConfig extends { apiKey?: string, baseUrl?: string, model?: string }>(
  options?: OpenAICompatibleValidationOptions<TConfig>,
): ProviderDefinition<TConfig>['validators'] {
  const checks = options?.checks ?? ['connectivity', 'model_list', 'chat_completions']
  const additionalHeaders = options?.additionalHeaders

  interface ModelListCheckResult {
    requestOk: boolean
    hasModels: boolean
    errorMessage?: string
    error?: unknown
  }

  interface ChatCheckResult {
    chatOk: boolean
    skipped: boolean
    errorMessage?: string
  }

  const modelListCheckCacheKey = 'openai-compatible:model-list-check'
  const modelListCheckMutexKey = 'openai-compatible:model-list-check:mutex'
  const runModelListCheck = async (
    config: TConfig,
    provider: ProviderInstance,
    providerExtra: ProviderExtraMethods<TConfig> | undefined,
  ): Promise<ModelListCheckResult> => {
    try {
      const models = await resolveModels(config, provider, providerExtra)
      return {
        requestOk: true,
        hasModels: Array.isArray(models) && models.length > 0,
      }
    }
    catch (e) {
      return {
        requestOk: false,
        hasModels: false,
        errorMessage: errorMessageFrom(e),
        error: e,
      }
    }
  }
  const getModelListCheckResult = async (
    config: TConfig,
    provider: ProviderInstance,
    providerExtra: ProviderExtraMethods<TConfig> | undefined,
    contextOptions?: { validationCache?: Map<string, unknown> },
  ) => {
    const cache = contextOptions?.validationCache
    const existing = cache?.get(modelListCheckCacheKey) as Promise<ModelListCheckResult> | undefined
    if (existing)
      return existing

    if (!cache)
      return runModelListCheck(config, provider, providerExtra)

    let mutex = cache.get(modelListCheckMutexKey) as Mutex | undefined
    if (!mutex) {
      mutex = new Mutex()
      cache.set(modelListCheckMutexKey, mutex)
    }

    await mutex.acquire()

    try {
      const cached = cache.get(modelListCheckCacheKey) as Promise<ModelListCheckResult> | undefined
      if (cached)
        return cached

      const sharedCheck = runModelListCheck(config, provider, providerExtra)
      cache.set(modelListCheckCacheKey, sharedCheck)
      return sharedCheck
    }
    finally {
      mutex.release()
    }
  }

  const chatCheckCacheKey = 'openai-compatible:chat-check'
  const chatCheckMutexKey = 'openai-compatible:chat-check:mutex'
  const runChatCheck = async (
    config: TConfig,
  ): Promise<ChatCheckResult> => {
    const selectedModel = getConfiguredValidationModel(config)
    if (!selectedModel) {
      return {
        chatOk: true,
        skipped: true,
      }
    }

    try {
      await generateText({
        apiKey: config.apiKey,
        baseURL: config.baseUrl!,
        headers: additionalHeaders,
        model: selectedModel,
        messages: message.messages(message.user('ping')),
        max_tokens: 1,
      })

      return {
        chatOk: true,
        skipped: false,
      }
    }
    catch (e) {
      if (isNetworkError(e)) {
        return {
          chatOk: false,
          skipped: false,
          errorMessage: errorMessageFrom(e),
        }
      }

      const status = extractStatusCode(e)
      const chatOk = typeof status === 'number' && status >= 200 && status < 300
      return {
        chatOk,
        skipped: false,
        errorMessage: errorMessageFrom(e),
      }
    }
  }
  const getChatCheckResult = async (
    config: TConfig,
    contextOptions?: { validationCache?: Map<string, unknown> },
  ) => {
    const cache = contextOptions?.validationCache
    const existing = cache?.get(chatCheckCacheKey) as Promise<ChatCheckResult> | undefined
    if (existing)
      return existing

    if (!cache)
      return runChatCheck(config)

    let mutex = cache.get(chatCheckMutexKey) as Mutex | undefined
    if (!mutex) {
      mutex = new Mutex()
      cache.set(chatCheckMutexKey, mutex)
    }

    await mutex.acquire()

    try {
      const cached = cache.get(chatCheckCacheKey) as Promise<ChatCheckResult> | undefined
      if (cached)
        return cached

      const sharedCheck = runChatCheck(config)

      cache.set(chatCheckCacheKey, sharedCheck)

      return sharedCheck
    }
    finally {
      mutex.release()
    }
  }

  const validatorConfig: ProviderDefinition<TConfig>['validators'] = {
    validateConfig: [],
    validateProvider: [],
  }

  validatorConfig.validateConfig?.push(({ t }) => ({
    id: 'openai-compatible:check-config',
    name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
    validator: async (config) => {
      const errors: Array<{ error: unknown }> = []
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const baseUrl = (config.baseUrl as string | URL | undefined) instanceof URL ? config.baseUrl?.toString() : (typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '')

      if (!apiKey)
        errors.push({ error: new Error('API key is required.') })
      if (!baseUrl)
        errors.push({ error: new Error('Base URL is required.') })

      if (baseUrl) {
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
  }))

  if (checks.includes('connectivity')) {
    validatorConfig.validateProvider?.push(({ t }) => ({
      id: 'openai-compatible:check-connectivity',
      name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
      schedule: options?.schedule,
      validator: async (config, provider, providerExtra, contextOptions) => {
        const errors: Array<{ error: unknown }> = []
        const result = await getModelListCheckResult(
          config,
          provider,
          providerExtra,
          contextOptions as { validationCache?: Map<string, unknown> } | undefined,
        )
        if (!result.requestOk) {
          const errorMessage = result.errorMessage || 'Unknown error.'
          const reason = options?.connectivityFailureReason
            ? options.connectivityFailureReason({ config, error: result.error, errorMessage })
            : `Connectivity check failed: ${errorMessage}`
          errors.push({ error: new Error(reason) })
        }

        return {
          errors,
          reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
          reasonKey: '',
          valid: errors.length === 0,
        }
      },
    }))
  }

  if (checks.includes('chat_completions')) {
    validatorConfig.validateProvider?.push(({ t }) => ({
      id: 'openai-compatible:check-chat-completions',
      name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-supports-chat-completion.title'),
      schedule: options?.schedule,
      validator: async (config, _provider, _providerExtra, contextOptions) => {
        const errors: Array<{ error: unknown }> = []
        const result = await getChatCheckResult(
          config,
          contextOptions as { validationCache?: Map<string, unknown> } | undefined,
        )
        if (!result.skipped && !result.chatOk) {
          errors.push({ error: new Error(`Chat completions check failed: ${result.errorMessage || 'Unknown error.'}`) })
        }

        return {
          errors,
          reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
          reasonKey: '',
          valid: errors.length === 0,
        }
      },
    }))
  }

  if (checks.includes('model_list')) {
    validatorConfig.validateProvider?.push(({ t }) => ({
      id: 'openai-compatible:check-model-list',
      name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-supports-model-listing.title'),
      schedule: options?.schedule,
      validator: async (config, provider, providerExtra, contextOptions) => {
        const errors: Array<{ error: unknown }> = []
        const result = await getModelListCheckResult(
          config,
          provider,
          providerExtra,
          contextOptions as { validationCache?: Map<string, unknown> } | undefined,
        )
        if (!result.requestOk) {
          const errorMessage = result.errorMessage || 'Unknown error.'
          const reason = options?.modelListFailureReason
            ? options.modelListFailureReason({ config, error: result.error, errorMessage })
            : `Model list check failed: ${errorMessage}`
          errors.push({ error: new Error(reason) })
        }
        else if (!result.hasModels) {
          errors.push({ error: new Error('Model list check failed: no models found') })
        }

        return {
          errors,
          reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
          reasonKey: '',
          valid: errors.length === 0,
        }
      },
    }))
  }

  return validatorConfig
}
