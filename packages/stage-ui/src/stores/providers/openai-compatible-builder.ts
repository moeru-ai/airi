import type { ModelInfo, ProviderMetadata } from '../providers'

import { listModels } from '@xsai/model'

import { isUrl } from '../../utils/url'

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
      const apiKey =
        typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const baseUrl =
        typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

      const provider = await creator(apiKey, baseUrl)
      
      // Check provider.model exists and is a function
      if (!provider || typeof provider.model !== 'function') {
        return []
      }

      const models = await listModels({
        ...provider.model(),
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
      
      // Safer cast before using URL
      let baseUrl =
        typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

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
      let responseModelList: Response | null = null
      let responseChat: Response | null = null

      if (validationChecks.includes('health')) {
        try {
          responseChat = await fetch(`${baseUrl}chat/completions`, {
            // Authorization always overrides additionalHeaders
            headers: {
              ...additionalHeaders,
              Authorization: `Bearer ${config.apiKey || ''}`,
            },
            method: 'POST',
            body: '{"model": "test"}',
          })

          responseModelList = await fetch(`${baseUrl}models`, {
            headers: {
              ...additionalHeaders,
              Authorization: `Bearer ${config.apiKey || ''}`,
            },
          })
          
          // Also try transcription endpoints for speech recognition servers
          let responseTranscription: Response | null = null
          try {
            const form =
              typeof FormData !== 'undefined' ? new FormData() : undefined
            responseTranscription = await fetch(`${baseUrl}audio/transcriptions`, {
              headers: {
                ...additionalHeaders,
                Authorization: `Bearer ${config.apiKey || ''}`,
              },
              method: 'POST',
              body: form,
            })
          }
          catch {
            // Transcription endpoint might not exist, that's okay
          }

          // Accept if any of the endpoints work (chat, models, or transcription)
          const validResponses = [responseChat, responseModelList, responseTranscription].filter(
            r =>
              r &&
              ((r.status >= 200 && r.status < 300) ||
                [400, 401, 403].includes(r.status)),
          )
          if (validResponses.length === 0) {
            errors.push(
              new Error(
                `Invalid Base URL, ${baseUrl} is not supported. Make sure your server supports OpenAI-compatible endpoints.`,
              ),
            )
          }
        }
        catch (e) {
          errors.push(new Error(`Invalid Base URL, ${(e as Error).message}`))
        }
      }

      if (errors.length > 0) {
        return {
          errors,
          reason: errors.map(e => e.message).join(', '),
          valid: false,
        }
      }

      if (validationChecks.includes('model_list')) {
        try {
          let response = responseModelList
          if (!response) {
            response = await fetch(`${baseUrl}models`, {
              headers: {
                ...additionalHeaders,
                Authorization: `Bearer ${config.apiKey || ''}`,
              },
            })
          }

          if (!response.ok) {
            errors.push(new Error('Invalid API Key'))
          }
        }
        catch (e) {
          errors.push(new Error(`Model list check failed: ${(e as Error).message}`))
        }
      }

      if (validationChecks.includes('chat_completions')) {
        try {
          let response = responseChat
          if (!response) {
            response = await fetch(`${baseUrl}chat/completions`, {
              headers: {
                ...additionalHeaders,
                Authorization: `Bearer ${config.apiKey || ''}`,
              },
              method: 'POST',
              body: '{"model": "test"}',
            })
          }

          if (!response.ok) {
            errors.push(new Error('Invalid API Key'))
          }
        }
        catch (e) {
          errors.push(
            new Error(`Chat Completions check Failed: ${(e as Error).message}`),
          )
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
    createProvider: async config => {
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
