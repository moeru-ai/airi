import type { ModelInfo, ProviderMetadata } from '../providers'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

type ProviderCreator = (apiKey: string, baseUrl: string) => any

function formatErrorForUser(e: unknown) {
  try {
    const redact = (s: string) => {
      // mask OpenAI-like secret keys (sk-...)
      s = s.replace(/sk-[A-Za-z0-9._-]{8,}/g, 'sk-(redacted)')
      // mask Bearer tokens
      s = s.replace(/Bearer\s+[A-Za-z0-9._\-=:]+/g, 'Bearer (redacted)')
      // mask any long hex-like/secret-looking tokens
      s = s.replace(/([A-Za-z0-9_\-]{20,})/g, (m) => (m.length > 8 ? m.slice(0, 4) + '...(redacted)' : m))
      return s
    }
    // If it's an Error, try to extract meaningful message
    if (e instanceof Error) {
      const msg = e.message || String(e)
      const trimmed = msg.trim()
      // If message looks like JSON, try to parse and extract common fields
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed)
          const candidate = parsed?.error || parsed?.errors || parsed
          if (typeof candidate === 'string') return candidate
          if (candidate?.message) return String(candidate.message)
          if (candidate?.error?.message) return String(candidate.error.message)
          if (parsed?.message) return String(parsed.message)
          // Fallback: stringify but keep it short
          return JSON.stringify(parsed, Object.keys(parsed).slice(0, 5))
        }
        catch {
          return redact(msg)
        }
      }

      return redact(msg)
    }

    if (typeof e === 'string') {
      const trimmed = e.trim()
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (parsed?.error?.message) return String(parsed.error.message)
          if (parsed?.message) return String(parsed.message)
          return JSON.stringify(parsed, Object.keys(parsed).slice(0, 5))
        }
        catch {
          return redact(e)
        }
      }
      return redact(e)
    }

    return redact(String(e))
  }
  catch {
    return String(e)
  }
}

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
        headers: additionalHeaders,
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

      // If API key is not provided, skip remote checks and prompt for API key only.
      // This avoids showing long JSON/network errors when user hasn't entered an API key yet.
      if (!apiKey) {
        return {
          errors: [new Error('API Key is required')],
          reason: 'API Key is required',
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
          headers: additionalHeaders,
        })
          .then((models: any[]) => models.filter((model: any) =>
            [
              // exclude embedding models
              'embed',
              // exclude tts models, specifically for OpenAI
              'tts',
              // bypass gemini pro quota
              // TODO: more elegant solution
              'models/gemini-2.5-pro',
            ].every(str => !model.id.includes(str)),
          ))

        if (models.length > 0)
          model = models[0].id
      }
      catch (e) {
        console.warn(`Model auto-detection failed: ${formatErrorForUser(e)}`)
      }

      // Health check = try generating text (was: fetch(`${baseUrl}chat/completions`))
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
        }
        catch (e) {
          errors.push(new Error(`Health check failed: ${formatErrorForUser(e)}`))
        }
      }

      // Model list validation (was: fetch(`${baseUrl}models`))
      if (validationChecks.includes('model_list')) {
        try {
          const models = await listModels({
            apiKey,
            baseURL: baseUrl,
            headers: additionalHeaders,
          })
          if (!models || models.length === 0) {
            errors.push(new Error('Model list check failed: no models found'))
          }
        }
        catch (e) {
          errors.push(new Error(`Model list check failed: ${formatErrorForUser(e)}`))
        }
      }

      // Chat completions validation = generateText again (was: fetch(`${baseUrl}chat/completions`))
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
        }
        catch (e) {
          errors.push(new Error(`Chat completions check failed: ${formatErrorForUser(e)}`))
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
