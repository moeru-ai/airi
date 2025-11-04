import type { ModelInfo, ProviderMetadata } from '../providers'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

type ProviderCreator = (apiKey: string, baseUrl: string) => any

// Utility helpers
const safeString = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : ''

const joinErrorMessages = (errors: Error[]): string =>
  errors.length ? errors.map(e => e.message).join(', ') : ''

// In-memory cache for listModels()
const modelCache = new Map<string, any[]>()

async function getModelsCached(
  apiKey: string,
  baseUrl: string,
  headers?: Record<string, string>,
) {
  const cacheKey = `${apiKey}:${baseUrl}:${headers ? JSON.stringify(headers) : ''}`
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey)!
  const models = await listModels({ apiKey, baseURL: baseUrl, headers })
  modelCache.set(cacheKey, models)
  return models
}

// Main provider builder
export function buildOpenAICompatibleProvider(
  options: Partial<ProviderMetadata> & {
    id: string
    name: string
    icon: string
    description: string
    nameKey: string
    descriptionKey: string
    category?: 'chat' | 'embed' | 'speech' | 'transcription'
    tasks?: string[]
    defaultBaseUrl?: string
    creator: ProviderCreator
    capabilities?: ProviderMetadata['capabilities']
    validators?: ProviderMetadata['validators']
    validation?: ('health' | 'model_list' | 'chat_completions')[]
    additionalHeaders?: Record<string, string>
  },
): ProviderMetadata {
  const {
    id,
    name,
    icon,
    description,
    nameKey,
    descriptionKey,
    category,
    tasks,
    defaultBaseUrl,
    creator,
    capabilities,
    validators,
    validation,
    additionalHeaders,
    ...rest
  } = options

  // Capabilities
  const finalCapabilities = capabilities || {
    listModels: async (config: Record<string, unknown>) => {
      const apiKey = safeString(config.apiKey)
      const baseUrl = safeString(config.baseUrl)
      const provider = await creator(apiKey, baseUrl)

      if (!provider || typeof provider.model !== 'function') {
        return []
      }

      const models = await getModelsCached(apiKey, baseUrl, additionalHeaders)

      return models.map((model: any) => ({
        id: model.id,
        name: model.name || model.display_name || model.id,
        provider: id,
        description: model.description || '',
        contextLength: model.context_length || 0,
        deprecated: false,
      }) satisfies ModelInfo)
    },
  }

  // Validators
  const finalValidators = validators || {
    validateProviderConfig: async (config: Record<string, unknown>) => {
      const errors: Error[] = []
      const apiKey = safeString(config.apiKey)
      let baseUrl = safeString(config.baseUrl)

      // --- Base URL checks ---
      if (!baseUrl) {
        errors.push(new Error('Base URL is required'))
      }

      try {
        if (new URL(baseUrl).host.length === 0) {
          errors.push(new Error('Base URL is not absolute. Check your input.'))
        }
      } catch {
        errors.push(new Error('Base URL is invalid. It must be an absolute URL.'))
      }

      // Normalize trailing slash
      if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl += '/'
      }

      if (errors.length > 0) {
        return {
          errors,
          reason: joinErrorMessages(errors),
          valid: false,
        }
      }

      const validationChecks = validation || []

      // --- Auto-detect first available model ---
      let model = 'test' // fallback
      try {
        const models = (await getModelsCached(apiKey, baseUrl, additionalHeaders)).filter(m =>
          ['embed', 'tts', 'models/gemini-2.5-pro'].every(str => !m.id.includes(str)),
        )
        if (models.length > 0) {
          model = models[0].id
        }
      } catch (e) {
        console.warn(`Model auto-detection failed: ${(e as Error).message}`)
      }

      // --- Validation checks ---
      // Runs sequentially for consistent behavior (same as original code)
      if (validationChecks.includes('health')) {
        try {
          await generateText({
            apiKey,
            baseURL: baseUrl,
            headers: additionalHeaders,
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })
        } catch (e) {
          errors.push(new Error(`Health check failed: ${(e as Error).message}`))
        }
      }

      if (validationChecks.includes('model_list')) {
        try {
          const models = await getModelsCached(apiKey, baseUrl, additionalHeaders)
          if (!models || models.length === 0) {
            errors.push(new Error('Model list check failed: no models found'))
          }
        } catch (e) {
          errors.push(new Error(`Model list check failed: ${(e as Error).message}`))
        }
      }

      if (validationChecks.includes('chat_completions')) {
        try {
          await generateText({
            apiKey,
            baseURL: baseUrl,
            headers: additionalHeaders,
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })
        } catch (e) {
          errors.push(new Error(`Chat completions check failed: ${(e as Error).message}`))
        }
      }

      // --- Final result ---
      return {
        errors,
        reason: joinErrorMessages(errors),
        valid: errors.length === 0,
      }
    },
  }

  // Return ProviderMetadata
  return {
    id,
    category: category || 'chat',
    tasks: tasks || ['text-generation'],
    nameKey,
    name,
    descriptionKey,
    description,
    icon,
    defaultOptions: () => ({
      baseUrl: defaultBaseUrl || '',
    }),
    createProvider: async (config: { apiKey: string; baseUrl: string }) => {
      const apiKey = safeString(config.apiKey)
      let baseUrl = safeString(config.baseUrl)
      if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl += '/'
      }
      return creator(apiKey, baseUrl)
    },
    capabilities: finalCapabilities,
    validators: finalValidators,
    ...rest,
  } as ProviderMetadata
}
