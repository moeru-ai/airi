import type { ProviderDefinition, ProviderExtraMethods, ProviderInstance } from '../types'

import isNetworkError from 'is-network-error'

import { errorMessageFrom } from '@moeru/std'
import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'
import { Mutex } from 'es-toolkit'

import { isModelProvider } from '../types'

type OpenAICompatibleValidationCheck = 'connectivity' | 'model_list' | 'chat_completions'

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

function shouldSkipModelId(modelId: string): boolean {
  return [
    'embed',
    'tts',
    'models/gemini-2.5-pro',
  ].some(fragment => modelId.includes(fragment))
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

async function pickValidationModel<TConfig extends { apiKey?: string | null, baseUrl?: string | URL | null }>(
  config: TConfig,
  provider: ProviderInstance,
  providerExtra: ProviderExtraMethods<TConfig> | undefined,
): Promise<string> {
  const fallback = 'test'

  try {
    const models = await resolveModels(config, provider, providerExtra)
    const modelId = extractModelId(models.find(model => !shouldSkipModelId(extractModelId(model))))
    return modelId || fallback
  }
  catch {
    return fallback
  }
}

export function createOpenAICompatibleValidators<TConfig extends { apiKey?: string, baseUrl?: string }>(options?: {
  checks?: OpenAICompatibleValidationCheck[]
  additionalHeaders?: Record<string, string>
}): ProviderDefinition<TConfig>['validators'] {
  const checks = options?.checks ?? ['connectivity', 'model_list', 'chat_completions']
  const additionalHeaders = options?.additionalHeaders

  interface ChatCheckResult {
    connectivityOk: boolean
    chatOk: boolean
    errorMessage?: string
  }

  const chatCheckCacheKey = 'openai-compatible:chat-check'
  const chatCheckMutexKey = 'openai-compatible:chat-check:mutex'
  const getChatCheckResult = async (
    config: TConfig,
    provider: ProviderInstance,
    providerExtra: ProviderExtraMethods<TConfig> | undefined,
    contextOptions?: { validationCache?: Map<string, unknown> },
  ) => {
    const cache = contextOptions?.validationCache
    const existing = cache?.get(chatCheckCacheKey) as Promise<ChatCheckResult> | undefined
    if (existing)
      return existing

    if (!cache) {
      const model = await pickValidationModel(config, provider, providerExtra)
      try {
        await generateText({
          apiKey: config.apiKey,
          baseURL: config.baseUrl!,
          headers: additionalHeaders,
          model,
          messages: message.messages(message.user('ping')),
          max_tokens: 1,
        })

        return { connectivityOk: true, chatOk: true }
      }
      catch (e) {
        if (isNetworkError(e)) {
          return { connectivityOk: false, chatOk: false, errorMessage: errorMessageFrom(e) }
        }

        const status = extractStatusCode(e)
        const chatOk = status === 400 || (status && status >= 200 && status < 300)
        return { connectivityOk: true, chatOk, errorMessage: errorMessageFrom(e) }
      }
    }

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

      const sharedCheck = (async () => {
        const model = await pickValidationModel(config, provider, providerExtra)
        try {
          await generateText({
            apiKey: config.apiKey,
            baseURL: config.baseUrl!,
            headers: additionalHeaders,
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })

          return { connectivityOk: true, chatOk: true }
        }
        catch (e) {
          if (isNetworkError(e)) {
            return { connectivityOk: false, chatOk: false, errorMessage: errorMessageFrom(e) }
          }

          const status = extractStatusCode(e)
          const chatOk = status === 400 || (status && status >= 200 && status < 300)
          return { connectivityOk: true, chatOk, errorMessage: errorMessageFrom(e) }
        }
      })()

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
      validator: async (config, provider, providerExtra, contextOptions) => {
        const errors: Array<{ error: unknown }> = []
        const result = await getChatCheckResult(
          config,
          provider,
          providerExtra,
          contextOptions as { validationCache?: Map<string, unknown> } | undefined,
        )
        if (!result.connectivityOk) {
          errors.push({ error: new Error(`Connectivity check failed: ${result.errorMessage || 'Unknown error.'}`) })
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
      validator: async (config, provider, providerExtra, contextOptions) => {
        const errors: Array<{ error: unknown }> = []
        const result = await getChatCheckResult(
          config,
          provider,
          providerExtra,
          contextOptions as { validationCache?: Map<string, unknown> } | undefined,
        )
        if (!result.chatOk) {
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
      validator: async (config, provider, providerExtra) => {
        const errors: Array<{ error: unknown }> = []
        try {
          const models = await resolveModels(config, provider, providerExtra)
          if (!models || models.length === 0) {
            errors.push({ error: new Error('Model list check failed: no models found') })
          }
        }
        catch (e) {
          errors.push({ error: new Error(`Model list check failed: ${(e as Error).message}`) })
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
