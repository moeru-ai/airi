import type { ModelInfo, ProviderMetadata } from '../providers'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

type ProviderCreator = (apiKey: string, baseUrl: string) => any

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
    /**
     * Extra headers to be sent for validation and model listing.
     * Values may be either string literals or a function that derives
     * the header value from the provided apiKey at runtime.
     */
    additionalHeaders?: Record<string, string | ((apiKey: string) => string)>
    /**
     * Whether to include the standard `Authorization: Bearer <apiKey>` header.
     * Some OpenAI-compatible providers (e.g. Anthropic, Google Generative AI)
     * do not use the Authorization header and require a provider-specific header.
     * Defaults to true.
     */
    useAuthorizationHeader?: boolean
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
    useAuthorizationHeader = true,
    ...rest
  } = options

  // Build headers per request considering provider-specific options
  const buildHeaders = (apiKey: string) => {
    const headers: Record<string, string> = {}

    if (useAuthorizationHeader) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    if (additionalHeaders) {
      for (const [key, value] of Object.entries(additionalHeaders)) {
        headers[key] = typeof value === 'function' ? value(apiKey) : value
      }
    }

    return headers
  }

  const finalCapabilities = capabilities || {
    listModels: async (config: Record<string, unknown>) => {
      // Safer casting of apiKey/baseUrl (prevents .trim() crash if not a string)
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

      const provider = await creator(apiKey, baseUrl)
      // Check provider.model exists and is a function
      if (!provider || typeof provider.model !== 'function') {
        return []
      }

      // Previously: fetch(`${baseUrl}models`)
      const models = await listModels({
        apiKey,
        baseURL: baseUrl,
        headers: buildHeaders(apiKey),
      })

      return models.map((model: any) => {
        return {
          id: model.id,
          name: model.name || model.display_name || model.id,
          provider: id,
          description: model.description || '',
          contextLength: model.context_length || 0,
          deprecated: false,
        } satisfies ModelInfo
      })
    },
  }

  const finalValidators = validators || {
    validateProviderConfig: async (config: Record<string, unknown>) => {
      const errors: Error[] = []
      let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''

      if (!baseUrl) {
        errors.push(new Error('Base URL is required'))
      }

      try {
        if (new URL(baseUrl).host.length === 0) {
          errors.push(new Error('Base URL is not absolute. Check your input.'))
        }
      }
      catch {
        errors.push(new Error('Base URL is invalid. It must be an absolute URL.'))
      }

      // normalize trailing slash instead of rejecting
      if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl += '/'
      }

      if (errors.length > 0) {
        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: false,
        }
      }

      const validationChecks = validation || []

      // Auto-detect first available model for validation
      let model = 'test' // fallback to `test` if fails
      try {
        const models = await listModels({
          apiKey,
          baseURL: baseUrl,
          headers: buildHeaders(apiKey),
        })
        if (models && models.length > 0)
          model = models[0].id
      }
      catch (e) {
        console.warn(`Model auto-detection failed: ${(e as Error).message}`)
      }

      // Health check = try generating text (was: fetch(`${baseUrl}chat/completions`))
      if (validationChecks.includes('health')) {
        try {
          await generateText({
            apiKey,
            baseURL: baseUrl,
            headers: buildHeaders(apiKey),
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })
        }
        catch (e) {
          errors.push(new Error(`Health check failed: ${(e as Error).message}`))
        }
      }

      // Model list validation (was: fetch(`${baseUrl}models`))
      if (validationChecks.includes('model_list')) {
        try {
          const models = await listModels({
            apiKey,
            baseURL: baseUrl,
            headers: buildHeaders(apiKey),
          })
          if (!models || models.length === 0) {
            errors.push(new Error('Model list check failed: no models found'))
          }
        }
        catch (e) {
          errors.push(new Error(`Model list check failed: ${(e as Error).message}`))
        }
      }

      // Chat completions validation = generateText again (was: fetch(`${baseUrl}chat/completions`))
      if (validationChecks.includes('chat_completions')) {
        try {
          await generateText({
            apiKey,
            baseURL: baseUrl,
            headers: buildHeaders(apiKey),
            model,
            messages: message.messages(message.user('ping')),
            max_tokens: 1,
          })
        }
        catch (e) {
          errors.push(new Error(`Chat completions check failed: ${(e as Error).message}`))
        }
      }

      return {
        errors,
        // Consistent reason string (empty when no errors)
        reason: errors.length > 0 ? errors.map(e => e.message).join(', ') : '',
        valid: errors.length === 0,
      }
    },
  }

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
    createProvider: async (config: { apiKey: string, baseUrl: string }) => {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
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
