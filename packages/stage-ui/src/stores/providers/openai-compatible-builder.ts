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
    supportsVision?: boolean
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
    supportsVision,
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

      // Check if we should skip validation via environment variable
      // Default to 'true' in browser environments to avoid CORS issues in serverless deployments
      const envSkipHealthCheck = import.meta.env.VITE_SKIP_PROVIDER_HEALTH_CHECK
      const defaultSkipInBrowser = typeof window !== 'undefined' && !(
        // @ts-expect-error - Tauri specific
        window.__TAURI__ !== undefined
        // @ts-expect-error - Electron specific
        || (window as any).process?.type === 'renderer'
      )

      // Priority: explicit env var > auto-detect browser environment
      const skipHealthChecks = envSkipHealthCheck !== undefined
        ? envSkipHealthCheck === 'true' || envSkipHealthCheck === true
        : defaultSkipInBrowser

      if (skipHealthChecks) {
        // eslint-disable-next-line no-console
        console.log('[Provider] Skipping health checks (SKIP_PROVIDER_HEALTH_CHECK=true or browser environment)')
        return {
          errors: [],
          reason: '',
          valid: true,
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
          .then(models => models.filter(model =>
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
        console.warn(`Model auto-detection failed: ${(e as Error).message}`)
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
          errors.push(new Error(`Health check failed: ${(e as Error).message}`))
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
          errors.push(new Error(`Model list check failed: ${(e as Error).message}`))
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
    supportsVision: supportsVision || false,
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
