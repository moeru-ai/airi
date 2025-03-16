import type { UnElevenLabsOptions } from '@xsai-ext/providers-local'
import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/shared-providers'
import type { VoiceProviderWithExtraOptions } from './fix/voice'

import { useLocalStorage } from '@vueuse/core'
import {
  createDeepSeek,
  createFireworks,
  createMistral,
  createMoonshot,
  createNovita,
  createOpenAI,
  createOpenRouter,
  createPerplexity,
  createTogetherAI,
  createWorkersAI,
  createXAI,
} from '@xsai-ext/providers-cloud'
import { createOllama } from '@xsai-ext/providers-local'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { createUnElevenLabs } from './fix/elevenlabs'
import { listVoices } from './fix/list-voices'
// import { createUnMicrosoft } from './fix/microsoft'

export interface ProviderMetadata {
  id: string
  nameKey: string // i18n key for provider name
  name: string // Default name (fallback)
  descriptionKey: string // i18n key for description
  description: string // Default description (fallback)
  icon?: string
  iconColor?: string
  iconImage?: string
  defaultOptions?: Record<string, unknown>
  createProvider: (config: Record<string, unknown>) =>
    | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions
  capabilities: {
    listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>
    listVoices?: (config: Record<string, unknown>) => Promise<VoiceInfo[]>
  }
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  capabilities?: string[]
  contextLength?: number
  deprecated?: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  provider: string
  description?: string
  gender?: string
  language?: string
  deprecated?: boolean
}

export const useProvidersStore = defineStore('providers', () => {
  const providerCredentials = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {})
  const { t } = useI18n()

  // Helper function to fetch OpenRouter models manually
  async function fetchOpenRouterModels(config: Record<string, unknown>): Promise<ModelInfo[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey as string}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`)
      }

      const data = await response.json()
      return data.data.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        provider: 'openrouter-ai',
        description: model.description || '',
        contextLength: model.context_length,
        deprecated: false,
      }))
    }
    catch (error) {
      console.error('Error fetching OpenRouter models:', error)
      throw error
    }
  }

  // Centralized provider metadata with provider factory functions
  const providerMetadata: Record<string, ProviderMetadata> = {
    'openrouter-ai': {
      id: 'openrouter-ai',
      nameKey: 'providers.openrouter.name',
      name: 'OpenRouter',
      descriptionKey: 'providers.openrouter.description',
      description: 'openrouter.ai',
      icon: 'i-lobe-icons:openrouter',
      defaultOptions: {
        baseUrl: 'https://openrouter.ai/api/v1/',
      },
      createProvider: config => createOpenRouter(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return fetchOpenRouterModels(config)
        },
      },
    },
    'openai': {
      id: 'openai',
      nameKey: 'providers.openai.name',
      name: 'OpenAI',
      descriptionKey: 'providers.openai.description',
      description: 'openai.com',
      icon: 'i-lobe-icons:openai',
      defaultOptions: {
        baseUrl: 'https://api.openai.com/v1/',
      },
      createProvider: config => createOpenAI(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOpenAI(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'openai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'ollama': {
      id: 'ollama',
      nameKey: 'providers.ollama.name',
      name: 'Ollama',
      descriptionKey: 'providers.ollama.description',
      description: 'ollama.com',
      icon: 'i-lobe-icons:ollama',
      defaultOptions: {
        baseUrl: 'http://localhost:11434/api/',
      },
      createProvider: config => createOllama(config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createOllama(config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'ollama',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'vllm': {
      id: 'vllm',
      nameKey: 'providers.vllm.name',
      name: 'vLLM',
      descriptionKey: 'providers.vllm.description',
      description: 'vllm.ai',
      iconColor: 'i-lobe-icons:vllm-color',
      createProvider: config => createOllama(config.baseUrl as string),
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'llama-2-7b',
              name: 'Llama 2 (7B)',
              provider: 'vllm',
              description: 'Meta\'s Llama 2 7B parameter model',
              contextLength: 4096,
            },
            {
              id: 'llama-2-13b',
              name: 'Llama 2 (13B)',
              provider: 'vllm',
              description: 'Meta\'s Llama 2 13B parameter model',
              contextLength: 4096,
            },
            {
              id: 'llama-2-70b',
              name: 'Llama 2 (70B)',
              provider: 'vllm',
              description: 'Meta\'s Llama 2 70B parameter model',
              contextLength: 4096,
            },
            {
              id: 'mistral-7b',
              name: 'Mistral (7B)',
              provider: 'vllm',
              description: 'Mistral AI\'s 7B parameter model',
              contextLength: 8192,
            },
            {
              id: 'mixtral-8x7b',
              name: 'Mixtral (8x7B)',
              provider: 'vllm',
              description: 'Mistral AI\'s Mixtral 8x7B MoE model',
              contextLength: 32768,
            },
            {
              id: 'custom',
              name: 'Custom Model',
              provider: 'vllm',
              description: 'Specify a custom model name',
              contextLength: 0,
            },
          ]
        },
      },
    },
    'perplexity-ai': {
      id: 'perplexity-ai',
      nameKey: 'providers.perplexity.name',
      name: 'Perplexity',
      descriptionKey: 'providers.perplexity.description',
      description: 'perplexity.ai',
      icon: 'i-lobe-icons:perplexity',
      defaultOptions: {
        baseUrl: 'https://api.perplexity.ai',
      },
      createProvider: config => createPerplexity(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async () => {
          return [
            {
              id: 'sonar-small-online',
              name: 'Sonar Small (Online)',
              provider: 'perplexity-ai',
              description: 'Efficient model with online search capabilities',
              contextLength: 12000,
            },
            {
              id: 'sonar-medium-online',
              name: 'Sonar Medium (Online)',
              provider: 'perplexity-ai',
              description: 'Balanced model with online search capabilities',
              contextLength: 12000,
            },
            {
              id: 'sonar-large-online',
              name: 'Sonar Large (Online)',
              provider: 'perplexity-ai',
              description: 'Powerful model with online search capabilities',
              contextLength: 12000,
            },
            {
              id: 'codey-small',
              name: 'Codey Small',
              provider: 'perplexity-ai',
              description: 'Specialized for code generation and understanding',
              contextLength: 12000,
            },
            {
              id: 'codey-large',
              name: 'Codey Large',
              provider: 'perplexity-ai',
              description: 'Advanced code generation and understanding',
              contextLength: 12000,
            },
          ]
        },
      },
    },
    'elevenlabs': {
      id: 'elevenlabs',
      nameKey: 'providers.elevenlabs.name',
      name: 'ElevenLabs',
      descriptionKey: 'providers.elevenlabs.description',
      description: 'elevenlabs.io',
      icon: 'i-simple-icons:elevenlabs',
      defaultOptions: {
        baseUrl: 'https://unspeech.hyp3r.link/v1/',
        voiceSettings: {
          similarityBoost: 0.75,
          stability: 0.5,
        },
      },
      // TODO: UnElevenLabsOptions
      createProvider: config => createUnElevenLabs(config.apiKey as string, config.baseUrl as string) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>,
      capabilities: {
        listModels: async () => {
          return []
        },
        listVoices: async (config) => {
          const provider = createUnElevenLabs(config.apiKey as string, config.baseUrl as string) as VoiceProviderWithExtraOptions<UnElevenLabsOptions>

          const voices = await listVoices({
            ...provider.voice(),
          })

          return voices.map((voice) => {
            return {
              id: voice.id,
              name: voice.name,
              provider: 'elevenlabs',
            }
          })
        },
      },
    },
    'xai': {
      id: 'xai',
      nameKey: 'providers.xai.name',
      name: 'xAI',
      descriptionKey: 'providers.xai.description',
      description: 'x.ai',
      icon: 'i-lobe-icons:xai',
      createProvider: config => createXAI(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createXAI(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'xai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'deepseek': {
      id: 'deepseek',
      nameKey: 'providers.deepseek.name',
      name: 'DeepSeek',
      descriptionKey: 'providers.deepseek.description',
      description: 'deepseek.com',
      iconColor: 'i-lobe-icons:deepseek-color',
      createProvider: config => createDeepSeek(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createDeepSeek(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'deepseek',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'together-ai': {
      id: 'together-ai',
      nameKey: 'providers.together.name',
      name: 'Together.ai',
      descriptionKey: 'providers.together.description',
      description: 'together.ai',
      iconColor: 'i-lobe-icons:together-color',
      createProvider: config => createTogetherAI(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createTogetherAI(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'together-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'novita-ai': {
      id: 'novita-ai',
      nameKey: 'providers.novita.name',
      name: 'Novita',
      descriptionKey: 'providers.novita.description',
      description: 'novita.ai',
      iconColor: 'i-lobe-icons:novita-color',
      createProvider: config => createNovita(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createNovita(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'novita-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'fireworks-ai': {
      id: 'fireworks-ai',
      nameKey: 'providers.fireworks.name',
      name: 'Fireworks.ai',
      descriptionKey: 'providers.fireworks.description',
      description: 'fireworks.ai',
      icon: 'i-lobe-icons:fireworks',
      createProvider: config => createFireworks(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createFireworks(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'fireworks-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'cloudflare-workers-ai': {
      id: 'cloudflare-workers-ai',
      nameKey: 'providers.cloudflare.name',
      name: 'Cloudflare Workers AI',
      descriptionKey: 'providers.cloudflare.description',
      description: 'cloudflare.com',
      iconColor: 'i-lobe-icons:cloudflare-color',
      createProvider: config => createWorkersAI(config.apiKey as string, config.accountId as string),
      capabilities: {
        listModels: async () => {
          return []
        },
      },
    },
    'mistral-ai': {
      id: 'mistral-ai',
      nameKey: 'providers.mistral.name',
      name: 'Mistral',
      descriptionKey: 'providers.mistral.description',
      description: 'mistral.ai',
      iconColor: 'i-lobe-icons:mistral-color',
      createProvider: config => createMistral(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createMistral(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'mistral-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
    'moonshot-ai': {
      id: 'moonshot-ai',
      nameKey: 'providers.moonshot.name',
      name: 'Moonshot AI',
      descriptionKey: 'providers.moonshot.description',
      description: 'moonshot.ai',
      icon: 'i-lobe-icons:moonshot',
      createProvider: config => createMoonshot(config.apiKey as string, config.baseUrl as string),
      capabilities: {
        listModels: async (config) => {
          return (await listModels({
            ...createMoonshot(config.apiKey as string, config.baseUrl as string).model(),
          })).map((model) => {
            return {
              id: model.id,
              name: model.id,
              provider: 'moonshot-ai',
              description: '',
              contextLength: 0,
              deprecated: false,
            } satisfies ModelInfo
          })
        },
      },
    },
  }

  // Configuration validation functions
  function validateProvider(providerId: string): boolean {
    const config = providerCredentials.value[providerId]
    if (!config)
      return false

    switch (providerId) {
      case 'openrouter-ai':
        return !!config.apiKey && !!config.baseUrl
      case 'openai':
        return !!config.apiKey
      case 'ollama':
        return !!config.baseUrl
      case 'vllm':
        return !!config.baseUrl
      case 'elevenlabs':
        return !!config.apiKey
      case 'xai':
        return !!config.apiKey
      case 'deepseek':
        return !!config.apiKey
      case 'together-ai':
        return !!config.apiKey
      case 'novita-ai':
        return !!config.apiKey
      case 'fireworks-ai':
        return !!config.apiKey
      case 'cloudflare-workers-ai':
        return !!config.apiKey
      case 'mistral-ai':
        return !!config.apiKey
      case 'moonshot-ai':
        return !!config.apiKey
      default:
        return false
    }
  }

  // Create computed properties for each provider's configuration status
  const configuredProviders = ref<Record<string, boolean>>({})

  // Initialize provider configurations
  function initializeProvider(providerId: string) {
    if (!providerCredentials.value[providerId]) {
      const metadata = providerMetadata[providerId]
      providerCredentials.value[providerId] = {
        baseUrl: metadata.defaultOptions?.baseUrl || '',
      }
    }
  }

  // Initialize all providers
  Object.keys(providerMetadata).forEach(initializeProvider)

  // Update configuration status for all providers
  function updateConfigurationStatus() {
    Object.keys(providerMetadata).forEach((providerId) => {
      configuredProviders.value[providerId] = validateProvider(providerId)
    })
  }

  // Call initially and watch for changes
  updateConfigurationStatus()
  watch(providerCredentials, updateConfigurationStatus, { deep: true })

  // Available providers (only those that are properly configured)
  const availableProviders = computed(() => {
    return Object.keys(providerMetadata).filter(providerId =>
      configuredProviders.value[providerId],
    )
  })

  // Store available models for each provider
  const availableModels = ref<Record<string, ModelInfo[]>>({})
  const isLoadingModels = ref<Record<string, boolean>>({})
  const modelLoadError = ref<Record<string, string | null>>({})

  // Function to fetch models for a specific provider
  async function fetchModelsForProvider(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      return []

    const metadata = providerMetadata[providerId]
    if (!metadata)
      return []

    isLoadingModels.value[providerId] = true
    modelLoadError.value[providerId] = null

    try {
      const models = metadata.capabilities.listModels ? await metadata.capabilities.listModels(config) : []

      // Transform and store the models
      availableModels.value[providerId] = models.map(model => ({
        id: model.id,
        name: model.id,
        provider: providerId,
      }))

      return availableModels.value[providerId]
    }
    catch (error) {
      console.error(`Error fetching models for ${providerId}:`, error)
      modelLoadError.value[providerId] = error instanceof Error ? error.message : 'Unknown error'
      return []
    }
    finally {
      isLoadingModels.value[providerId] = false
    }
  }

  // Get models for a specific provider
  function getModelsForProvider(providerId: string) {
    return availableModels.value[providerId] || []
  }

  // Get all available models across all configured providers
  const allAvailableModels = computed(() => {
    const models: ModelInfo[] = []
    for (const providerId of availableProviders.value) {
      models.push(...(availableModels.value[providerId] || []))
    }
    return models
  })

  // Load models for all configured providers
  async function loadModelsForConfiguredProviders() {
    for (const providerId of availableProviders.value) {
      if (providerMetadata[providerId].capabilities.listModels) {
        await fetchModelsForProvider(providerId)
      }
    }
  }

  // Function to get localized provider metadata
  function getProviderMetadata(providerId: string) {
    const metadata = providerMetadata[providerId]

    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    return {
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
    }
  }

  // Get all providers metadata (for settings page)
  const allProvidersMetadata = computed(() => {
    return Object.values(providerMetadata).map(metadata => ({
      ...metadata,
      localizedName: t(metadata.nameKey, metadata.name),
      localizedDescription: t(metadata.descriptionKey, metadata.description),
      configured: configuredProviders.value[metadata.id] || false,
    }))
  })

  // Function to get provider object by provider id
  function getProviderInstance(providerId: string) {
    const config = providerCredentials.value[providerId]
    if (!config)
      throw new Error(`Provider credentials for ${providerId} not found`)

    const metadata = providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    try {
      return metadata.createProvider(config)
    }
    catch (error) {
      console.error(`Error creating provider instance for ${providerId}:`, error)
      throw error
    }
  }

  const availableProvidersMetadata = computed(() => {
    return availableProviders.value.map(id => getProviderMetadata(id))
  })

  function getProviderConfig(providerId: string) {
    return providerCredentials.value[providerId]
  }

  return {
    providers: providerCredentials,
    getProviderConfig,
    availableProviders,
    configuredProviders,
    providerMetadata,
    getProviderMetadata,
    allProvidersMetadata,
    initializeProvider,
    validateProvider,
    availableModels,
    isLoadingModels,
    modelLoadError,
    fetchModelsForProvider,
    getModelsForProvider,
    allAvailableModels,
    loadModelsForConfiguredProviders,
    getProviderInstance,
    availableProvidersMetadata,
  }
})
