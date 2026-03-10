import type { ProviderMetadata } from '../providers'

import { createOpenAI } from '@xsai-ext/providers/create'

import { SERVER_URL } from '../../libs/server'

const OFFICIAL_ICON = 'i-solar:star-bold-duotone'

function withCredentials() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    return globalThis.fetch(input, {
      ...init,
      credentials: 'include',
    })
  }
}

function createOfficialOpenAIProvider() {
  return createOpenAI('', `${SERVER_URL}/api/v1/`)
}

export const OFFICIAL_PROVIDER_IDS = [
  'official-provider',
  'official-provider-speech',
  'official-provider-transcription',
] as const

/**
 * Factory that creates official provider metadata.
 * Accepts a lazy auth getter to avoid circular dependency:
 * official.ts -> auth.ts -> providers.ts -> official.ts
 */
export function createOfficialProviders(getIsAuthenticated: () => boolean): Record<string, ProviderMetadata> {
  function assertAuthenticated() {
    if (!getIsAuthenticated()) {
      throw new Error('User is not authenticated')
    }
  }

  function validateAuth() {
    return {
      errors: [],
      reason: '',
      valid: getIsAuthenticated(),
    }
  }

  return {
    'official-provider': {
      id: 'official-provider',
      order: -1,
      category: 'chat',
      tasks: ['text-generation'],
      nameKey: 'settings.pages.providers.provider.official.title',
      name: 'Official Provider',
      descriptionKey: 'settings.pages.providers.provider.official.description',
      description: 'Official AI provider by AIRI.',
      icon: OFFICIAL_ICON,
      requiresCredentials: false,
      createProvider: async (_config) => {
        assertAuthenticated()
        const provider = createOfficialOpenAIProvider()

        const originalChat = provider.chat.bind(provider)
        provider.chat = (model: string) => {
          const result = originalChat(model)
          result.fetch = withCredentials()
          return result
        }

        return provider
      },
      capabilities: {
        listModels: async () => [
          {
            id: 'auto',
            name: 'Auto',
            provider: 'official-provider',
            description: 'Automatically routed by AI Gateway',
          },
        ],
      },
      validators: {
        validateProviderConfig: () => validateAuth(),
      },
    },

    'official-provider-speech': {
      id: 'official-provider-speech',
      order: -1,
      category: 'speech',
      tasks: ['text-to-speech'],
      nameKey: 'settings.pages.providers.provider.official.speech-title',
      name: 'Official Speech Provider',
      descriptionKey: 'settings.pages.providers.provider.official.speech-description',
      description: 'Official text-to-speech provider by AIRI.',
      icon: OFFICIAL_ICON,
      requiresCredentials: false,
      createProvider: async (_config) => {
        assertAuthenticated()
        const provider = createOfficialOpenAIProvider()

        const originalSpeech = provider.speech.bind(provider)
        provider.speech = (model: string) => {
          const result = originalSpeech(model)
          result.fetch = withCredentials()
          return result
        }

        return provider
      },
      capabilities: {
        listModels: async () => [
          {
            id: 'auto',
            name: 'Auto',
            provider: 'official-provider-speech',
            description: 'Automatically routed by AI Gateway',
          },
        ],
        listVoices: async () => [
          { id: 'alloy', name: 'Alloy', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
          { id: 'echo', name: 'Echo', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
          { id: 'fable', name: 'Fable', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
          { id: 'onyx', name: 'Onyx', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
          { id: 'nova', name: 'Nova', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
          { id: 'shimmer', name: 'Shimmer', provider: 'official-provider-speech', languages: [{ code: 'en', title: 'English' }] },
        ],
      },
      validators: {
        validateProviderConfig: () => validateAuth(),
      },
    },

    'official-provider-transcription': {
      id: 'official-provider-transcription',
      order: -1,
      category: 'transcription',
      tasks: ['speech-to-text', 'asr'],
      nameKey: 'settings.pages.providers.provider.official.transcription-title',
      name: 'Official Transcription Provider',
      descriptionKey: 'settings.pages.providers.provider.official.transcription-description',
      description: 'Official speech-to-text provider by AIRI.',
      icon: OFFICIAL_ICON,
      requiresCredentials: false,
      transcriptionFeatures: {
        supportsGenerate: true,
        supportsStreamOutput: false,
        supportsStreamInput: false,
      },
      createProvider: async (_config) => {
        assertAuthenticated()
        const provider = createOfficialOpenAIProvider()

        const originalTranscription = provider.transcription.bind(provider)
        provider.transcription = (model: string) => {
          const result = originalTranscription(model)
          result.fetch = withCredentials()
          return result
        }

        return provider
      },
      capabilities: {
        listModels: async () => [
          {
            id: 'auto',
            name: 'Auto',
            provider: 'official-provider-transcription',
            description: 'Automatically routed by AI Gateway',
          },
        ],
      },
      validators: {
        validateProviderConfig: () => validateAuth(),
      },
    },
  }
}
