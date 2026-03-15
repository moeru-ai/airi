import type { ModelInfo, ProviderMetadata } from '../providers'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

type ProviderCreator = (apiKey: string, baseUrl: string) => any

// Lightweight normalization utilities and conditional logging
function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBaseUrl(value: unknown): string {
  let base = normalizeString(value)
  if (base && !base.endsWith('/'))
    base += '/'
  return base
}

function shouldLog(): boolean {
  try {
    // Opt-in via localStorage to minimize I/O in production
    return typeof localStorage !== 'undefined' && localStorage.getItem('airi:debug') === '1'
  }
  catch {
    return false
  }
}

function logWarn(...args: unknown[]) {
  if (shouldLog())
    console.warn(...args)
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
    transcriptionFeatures?: ProviderMetadata['transcriptionFeatures']
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
    transcriptionFeatures,
    ...rest
  } = options

  const defaultCapabilities = {
    listModels: async (config: Record<string, unknown>) => {
      // Safer casting of apiKey/baseUrl (prevents .trim() crash if not a string)
      const apiKey = normalizeString(config.apiKey)
      const baseUrl = normalizeBaseUrl(config.baseUrl)

      // If not configured yet, avoid remote calls and return empty
      if (!apiKey || !baseUrl) {
        return []
      }

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

  const finalCapabilities = {
    ...defaultCapabilities,
    ...capabilities,
  }

  const finalValidators = validators || {
    validateProviderConfig: async (config: Record<string, unknown>) => {
      const errors: Error[] = []
      let baseUrl = normalizeString(config.baseUrl)
      const apiKey = normalizeString(config.apiKey)

      if (!apiKey) {
        errors.push(new Error('API Key is required'))
      }

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
      baseUrl = normalizeBaseUrl(baseUrl)

      if (errors.length > 0) {
        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: false,
        }
      }

      const validationChecks = validation || []
      const hasApiKey = Boolean(apiKey)
      // Prepare model auto-detection promise for checks that need it
      const modelPromise = (async () => {
        let detected = 'test'
        if (!hasApiKey)
          return detected
        try {
          const models = await listModels({
            apiKey,
            baseURL: baseUrl,
            headers: additionalHeaders,
          })
            .then(models => models.filter(model =>
              [
                'embed',
                'tts',
                'models/gemini-2.5-pro',
              ].every(str => !model.id.includes(str)),
            ))
          if (models.length > 0)
            detected = models[0].id
        }
        catch (e) {
          logWarn(`Model auto-detection failed: ${(e as Error).message}`)
          logWarn('Falling back to default test model for validation checks.')
          try {
            if (capabilities?.listModels) {
              const models = await capabilities.listModels(config)
              if (models.length <= 0) {
                throw new Error('No models returned from capabilities.listModels')
              }
              return models[0].id
            }
          }
          catch (e) {
            logWarn(`Model auto-detection via capabilities.listModels also failed: ${(e as Error).message}`)
          }
        }
        return detected
      })()

      // Health check = try generating text (was: fetch(`${baseUrl}chat/completions`))
      const asyncChecks: Promise<Error | null>[] = []
      if (validationChecks.includes('health') && hasApiKey) {
        asyncChecks.push((async () => {
          try {
            const model = await modelPromise
            await generateText({
              apiKey,
              baseURL: baseUrl,
              headers: additionalHeaders,
              model,
              messages: message.messages(message.user('ping')),
              max_tokens: 1,
            })
            return null
          }
          catch (e) {
            return new Error(`Health check failed: ${(e as Error).message}`)
          }
        })())
      }

      // Model list validation (was: fetch(`${baseUrl}models`))
      if (validationChecks.includes('model_list') && hasApiKey) {
        asyncChecks.push((async () => {
          try {
            const models = await listModels({
              apiKey,
              baseURL: baseUrl,
              headers: additionalHeaders,
            })
            if (!models || models.length === 0) {
              return new Error('Model list check failed: no models found')
            }
            return null
          }
          catch (e) {
            return new Error(`Model list check failed: ${(e as Error).message}`)
          }
        })())
      }

      if (asyncChecks.length > 0) {
        const results = await Promise.allSettled(asyncChecks)
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value)
            errors.push(r.value)
          else if (r.status === 'rejected')
            errors.push(new Error(String(r.reason)))
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

  const resolvedCategory = category ?? 'chat'

  return {
    id,
    category: resolvedCategory,
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
      const apiKey = normalizeString(config.apiKey)
      const baseUrl = normalizeBaseUrl(config.baseUrl)
      return creator(apiKey, baseUrl)
    },
    capabilities: finalCapabilities,
    validators: finalValidators,
    ...(resolvedCategory === 'transcription'
      ? {
          transcriptionFeatures: transcriptionFeatures ?? {
            supportsGenerate: true,
            supportsStreamOutput: false,
            supportsStreamInput: false,
          },
        }
      : {}),
    ...rest,
  } as ProviderMetadata
}
