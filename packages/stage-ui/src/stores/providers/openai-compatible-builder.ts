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
  const { id, name, icon, description, nameKey, descriptionKey, category, tasks, defaultBaseUrl, creator, capabilities, validators, validation, additionalHeaders, ...rest } = options

  const finalCapabilities = capabilities || {
    listModels: async (config: Record<string, unknown>) => {
      const provider = creator(
        (config.apiKey as string || '').trim(),
        (config.baseUrl as string || '').trim(),
      )
      if (provider.model) {
        return (await listModels({
          ...provider.model(),
        })).map((model: any) => {
          return {
            id: model.id,
            name: model.name || model.display_name || model.id,
            provider: id,
            description: model.description || '',
            contextLength: model.context_length || 0,
            deprecated: false,
          } satisfies ModelInfo
        })
      }
      return []
    },
  }

  const finalValidators = validators || {
    validateProviderConfig: async (config: Record<string, unknown>) => {
      const errors: Error[] = []

      if (!config.baseUrl) {
        errors.push(new Error('Base URL is required'))
      }

      if (errors.length > 0) {
        return { errors, reason: errors.map(e => e.message).join(', '), valid: false }
      }

      if (!isUrl(config.baseUrl as string) || new URL(config.baseUrl as string).host.length === 0) {
        errors.push(new Error('Base URL is not absolute. Check your input.'))
      }

      if (!(config.baseUrl as string).endsWith('/')) {
        errors.push(new Error('Base URL must end with a trailing slash (/).'))
      }

      if (errors.length > 0) {
        return { errors, reason: errors.map(e => e.message).join(', '), valid: false }
      }

      const validationChecks = validation || []
      let responseModelList = null
      let responseChat = null

      if (validationChecks.includes('health')) {
        try {
          responseChat = await fetch(`${config.baseUrl as string}chat/completions`, { headers: { Authorization: `Bearer ${config.apiKey}`, ...additionalHeaders }, method: 'POST', body: '{"model": "test"}' })
          responseModelList = await fetch(`${config.baseUrl as string}models`, { headers: { Authorization: `Bearer ${config.apiKey}`, ...additionalHeaders } })

          if (!([200, 400, 401].includes(responseChat.status) || [200, 400, 401].includes(responseModelList.status))) {
            errors.push(new Error(`Invalid Base URL, ${config.baseUrl} is not supported`))
          }
        }
        catch (e) {
          errors.push(new Error(`Invalid Base URL, ${(e as Error).message}`))
        }
      }

      if (errors.length > 0) {
        return { errors, reason: errors.map(e => e.message).join(', '), valid: false }
      }

      if (validationChecks.includes('model_list')) {
        try {
          let response = responseModelList
          if (!response) {
            response = await fetch(`${config.baseUrl as string}models`, { headers: { Authorization: `Bearer ${config.apiKey}`, ...additionalHeaders } })
          }

          if (!response.ok) {
            errors.push(new Error(`Invalid API Key`))
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
            response = await fetch(`${config.baseUrl as string}chat/completions`, { headers: { Authorization: `Bearer ${config.apiKey}`, ...additionalHeaders }, method: 'POST', body: '{"model": "test"}' })
          }

          if (!response.ok) {
            errors.push(new Error(`Invalid API Key`))
          }
        }
        catch (e) {
          errors.push(new Error(`Chat Completions check Failed: ${(e as Error).message}`))
        }
      }

      return {
        errors,
        reason: errors.map(e => e.message).join(', ') || '',
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
    createProvider: async config => creator((config.apiKey as string || '').trim(), (config.baseUrl as string || '').trim()),
    capabilities: finalCapabilities,
    validators: finalValidators,
    ...rest,
  } as ProviderMetadata
}
