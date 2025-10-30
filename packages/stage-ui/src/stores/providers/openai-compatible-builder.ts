import type { ModelInfo, ProviderMetadata } from '../providers'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

import {
  formatErrorForUser,
  buildValidationResult,
  buildFetchErrorResult,
} from '../../utils/providerValidation'

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

  // --- Default capabilities if provider does not define its own ---
  const finalCapabilities = capabilities || {
    listModels: async (config: Record<string, unknown>) => {
      // Safer casting of apiKey/baseUrl (prevents .trim() crash if not a string)
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

      const provider = await creator(apiKey, baseUrl)
      // Check provider.model exists and is a function
      if (!provider || typeof provider.model !== 'function')
        return []

      // Fetch model list using standard OpenAI-compatible endpoint
      // (was: fetch(`${baseUrl}models`))
      try {
        const models = await listModels({
          apiKey,
          baseURL: baseUrl,
          headers: additionalHeaders,
        })

        return models.map((model: any) => ({
          id: model.id,
          name: model.name || model.display_name || model.id,
          provider: id,
          description: model.description || '',
          contextLength: model.context_length || 0,
          deprecated: false,
        }) satisfies ModelInfo)
      }
      catch (err) {
        console.warn(`Model list fetch failed: ${formatErrorForUser(err)}`)
        return []
      }
    },
  }

  // --- Default validation logic for OpenAI-compatible providers ---
  const finalValidators = validators || {
    validateProviderConfig: async (config: Record<string, unknown>) => {
      const errors: Error[] = []
      let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''

      // --- Basic input validation ---
      if (!baseUrl)
        errors.push(new Error('Base URL is required.'))

      try {
        if (new URL(baseUrl).host.length === 0)
          errors.push(new Error('Base URL is not absolute. Check your input.'))
      }
      catch {
        errors.push(new Error('Base URL is invalid. It must be an absolute URL.'))
      }

      // Normalize trailing slash instead of rejecting invalid URL
      if (baseUrl && !baseUrl.endsWith('/'))
        baseUrl += '/'

      // Return early if base URL problems exist
      if (errors.length > 0)
        return buildValidationResult(errors, false)

      // If API key is missing, skip remote validation to avoid confusing network errors
      if (!apiKey)
        return buildValidationResult([new Error('API Key is required.')], false)

      const validationChecks = validation || []

      // --- Auto-detect first available model for validation ---
      // fallback to `test` if detection fails
      let model = 'test'
      try {
        const models = await listModels({
          apiKey,
          baseURL: baseUrl,
          headers: additionalHeaders,
        }).then((models: any[]) =>
          models.filter((m: any) =>
            [
              // exclude embedding models
              'embed',
              // exclude tts models (OpenAI specific)
              'tts',
              // bypass gemini pro quota
              'models/gemini-2.5-pro',
            ].every(str => !m.id.includes(str)),
          ),
        )

        if (models.length > 0)
          model = models[0].id
      }
      catch (err) {
        // Keep only warning for auto-detection (don’t fail validation)
        console.warn(`Model auto-detection failed: ${formatErrorForUser(err)}`)
      }

      // --- Validation routines based on `validation` array ---

      // Health check = send minimal test prompt
      // (was: fetch(`${baseUrl}chat/completions`))
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
        catch (err) {
          errors.push(new Error(`Health check failed: ${formatErrorForUser(err)}`))
        }
      }

      // Model list validation
      // (was: fetch(`${baseUrl}models`))
      if (validationChecks.includes('model_list')) {
        try {
          const models = await listModels({
            apiKey,
            baseURL: baseUrl,
            headers: additionalHeaders,
          })
          if (!models || models.length === 0)
            errors.push(new Error('Model list check failed: no models found.'))
        }
        catch (err) {
          errors.push(new Error(`Model list check failed: ${formatErrorForUser(err)}`))
        }
      }

      // Chat completions validation
      // (was: fetch(`${baseUrl}chat/completions`))
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
        catch (err) {
          errors.push(new Error(`Chat completions check failed: ${formatErrorForUser(err)}`))
        }
      }

      // Return normalized validation result (safe, human-readable)
      return buildValidationResult(errors, errors.length === 0)
    },
  }

  // --- Construct final provider metadata object ---
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
    // Create provider instance
    createProvider: async (config: { apiKey: string; baseUrl: string }) => {
      const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
      let baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      if (baseUrl && !baseUrl.endsWith('/'))
        baseUrl += '/'
      return creator(apiKey, baseUrl)
    },
    capabilities: finalCapabilities,
    validators: finalValidators,
    ...rest,
  } as ProviderMetadata
}
