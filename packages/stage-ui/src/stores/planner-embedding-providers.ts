import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo, ProviderMetadata, ProviderRuntimeState } from './providers'

import { useLocalStorage } from '@vueuse/core'
import { createOpenAI } from '@xsai-ext/providers/create'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const openAIEmbeddingModels: ModelInfo[] = [
  {
    id: 'text-embedding-3-small',
    name: 'text-embedding-3-small',
    provider: 'planner-embedding-openai',
    description: 'Lower cost and faster responses for semantic retrieval.',
  },
  {
    id: 'text-embedding-3-large',
    name: 'text-embedding-3-large',
    provider: 'planner-embedding-openai',
    description: 'Higher quality semantic representation for recall.',
  },
]

const alibabaEmbeddingModels: ModelInfo[] = [
  {
    id: 'text-embedding-v4',
    name: 'text-embedding-v4',
    provider: 'planner-embedding-alibaba',
    description: 'Qwen embedding model hosted on DashScope.',
  },
]

function normalizeCredentialString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateBaseUrl(baseUrl: unknown) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return {
      errors: [new Error('Base URL is required.')],
      reason: 'Base URL is required.',
      valid: false,
    }
  }

  try {
    const url = new URL(baseUrl)
    if (!url.protocol.startsWith('http')) {
      return {
        errors: [new Error('Base URL must use http or https.')],
        reason: 'Base URL must use http or https.',
        valid: false,
      }
    }
  }
  catch {
    return {
      errors: [new Error('Base URL is invalid.')],
      reason: 'Base URL is invalid.',
      valid: false,
    }
  }

  return {
    errors: [],
    reason: '',
    valid: true,
  }
}

function createPlannerEmbeddingProviderMetadata(): Record<string, ProviderMetadata> {
  return {
    'planner-embedding-openai': {
      id: 'planner-embedding-openai',
      order: 1,
      category: 'embed',
      tasks: ['text-embedding', 'embedding'],
      nameKey: 'settings.pages.providers.provider.openai.title',
      name: 'OpenAI Embedding',
      descriptionKey: 'settings.pages.providers.provider.openai.description',
      description: 'OpenAI embedding API (text-embedding-3-small / text-embedding-3-large).',
      icon: 'i-lobe-icons:openai',
      defaultOptions: () => ({
        baseUrl: 'https://api.openai.com/v1/',
      }),
      createProvider: (config) => {
        const normalizedApiKey = normalizeCredentialString(config.apiKey)
        const normalizedBaseUrl = normalizeCredentialString(config.baseUrl)
        return createOpenAI(
          normalizedApiKey,
          normalizedBaseUrl || 'https://api.openai.com/v1/',
        )
      },
      capabilities: {
        listModels: async () => openAIEmbeddingModels,
      },
      validators: {
        validateProviderConfig: (config) => {
          const baseUrl = normalizeCredentialString(config.baseUrl)
          const apiKey = normalizeCredentialString(config.apiKey)
          const baseUrlValidation = validateBaseUrl(baseUrl)
          if (!baseUrlValidation.valid) {
            return baseUrlValidation
          }

          if (!apiKey) {
            return {
              errors: [new Error('API Key is required.')],
              reason: 'API Key is required.',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    },
    'planner-embedding-alibaba': {
      id: 'planner-embedding-alibaba',
      order: 2,
      category: 'embed',
      tasks: ['text-embedding', 'embedding'],
      nameKey: 'settings.pages.providers.provider.alibaba-cloud-model-studio.title',
      name: 'Alibaba DashScope Embedding',
      descriptionKey: 'settings.pages.providers.provider.alibaba-cloud-model-studio.description',
      description: 'Qwen embedding API over DashScope OpenAI-compatible endpoint.',
      icon: 'i-simple-icons:alibabacloud',
      defaultOptions: () => ({
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      }),
      createProvider: (config) => {
        const normalizedApiKey = normalizeCredentialString(config.apiKey)
        const normalizedBaseUrl = normalizeCredentialString(config.baseUrl)
        return createOpenAI(
          normalizedApiKey,
          normalizedBaseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        )
      },
      capabilities: {
        listModels: async () => alibabaEmbeddingModels,
      },
      validators: {
        validateProviderConfig: (config) => {
          const baseUrl = normalizeCredentialString(config.baseUrl)
          const apiKey = normalizeCredentialString(config.apiKey)
          const baseUrlValidation = validateBaseUrl(baseUrl)
          if (!baseUrlValidation.valid) {
            return baseUrlValidation
          }

          if (!apiKey) {
            return {
              errors: [new Error('API Key is required.')],
              reason: 'API Key is required.',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            valid: true,
          }
        },
      },
    },
  }
}

export const usePlannerEmbeddingProvidersStore = defineStore('planner-embedding-providers', () => {
  const providerMetadata = createPlannerEmbeddingProviderMetadata()
  const plannerEmbeddingProviders = useLocalStorage<Record<string, Record<string, unknown>>>(
    'settings/credentials/providers-planner-embedding',
    {},
  )
  const addedPlannerEmbeddingProviders = useLocalStorage<Record<string, boolean>>(
    'settings/providers/planner-embedding/added',
    {},
  )
  const providerRuntimeState = ref<Record<string, ProviderRuntimeState>>({})
  const providerInstanceCache = ref<Record<string, unknown>>({})
  const previousCredentialHashes = ref<Record<string, string>>({})

  const embeddingConfiguredProviders = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isConfigured
    }
    return result
  })

  const embeddingAvailableModels = computed(() => {
    const result: Record<string, ModelInfo[]> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.models
    }
    return result
  })

  const embeddingIsLoadingModels = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isLoadingModels
    }
    return result
  })

  const embeddingModelLoadError = computed(() => {
    const result: Record<string, string | null> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelLoadError
    }
    return result
  })

  function getDefaultProviderConfig(providerId: string) {
    const metadata = providerMetadata[providerId]
    const defaultOptions = metadata?.defaultOptions?.() || {}
    return {
      ...defaultOptions,
      ...(Object.prototype.hasOwnProperty.call(defaultOptions, 'baseUrl') ? {} : { baseUrl: '' }),
    }
  }

  function initializeProvider(providerId: string) {
    if (!plannerEmbeddingProviders.value[providerId]) {
      plannerEmbeddingProviders.value[providerId] = getDefaultProviderConfig(providerId)
    }
    if (!providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId] = {
        isConfigured: false,
        models: [],
        isLoadingModels: false,
        modelLoadError: null,
      }
    }
  }

  function markProviderAdded(providerId: string) {
    addedPlannerEmbeddingProviders.value[providerId] = true
  }

  function unmarkProviderAdded(providerId: string) {
    delete addedPlannerEmbeddingProviders.value[providerId]
  }

  async function validateProvider(providerId: string): Promise<boolean> {
    const metadata = providerMetadata[providerId]
    if (!metadata)
      return false

    const config = plannerEmbeddingProviders.value[providerId]
    if (!config)
      return false

    const configString = JSON.stringify(config || {})
    const runtimeState = providerRuntimeState.value[providerId]
    if (runtimeState?.validatedCredentialHash === configString && typeof runtimeState.isConfigured === 'boolean')
      return runtimeState.isConfigured

    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].validatedCredentialHash = configString
    }

    const validationResult = await metadata.validators.validateProviderConfig(config || {})
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = validationResult.valid
    }

    return validationResult.valid
  }

  async function updateConfigurationStatus() {
    await Promise.all(Object.keys(providerMetadata).map(async (providerId) => {
      try {
        if (providerRuntimeState.value[providerId]) {
          const isValid = await validateProvider(providerId)
          providerRuntimeState.value[providerId].isConfigured = isValid
        }
      }
      catch {
        if (providerRuntimeState.value[providerId]) {
          providerRuntimeState.value[providerId].isConfigured = false
        }
      }
    }))
  }

  async function fetchModelsForProvider(providerId: string) {
    const config = plannerEmbeddingProviders.value[providerId]
    if (!config)
      return []

    const metadata = providerMetadata[providerId]
    if (!metadata)
      return []

    const runtimeState = providerRuntimeState.value[providerId]
    if (runtimeState) {
      runtimeState.isLoadingModels = true
      runtimeState.modelLoadError = null
    }

    try {
      const models = metadata.capabilities.listModels
        ? await metadata.capabilities.listModels(config)
        : []

      if (runtimeState) {
        runtimeState.models = models.map(model => ({
          id: model.id,
          name: model.name,
          description: model.description,
          contextLength: model.contextLength,
          deprecated: model.deprecated,
          provider: providerId,
        }))
        return runtimeState.models
      }

      return []
    }
    catch (error) {
      console.error(`Error fetching planner embedding models for ${providerId}:`, error)
      if (runtimeState) {
        runtimeState.modelLoadError = error instanceof Error ? error.message : 'Unknown error'
      }
      return []
    }
    finally {
      if (runtimeState) {
        runtimeState.isLoadingModels = false
      }
    }
  }

  function getModelsForProvider(providerId: string) {
    return providerRuntimeState.value[providerId]?.models || []
  }

  function getProviderConfig(providerId: string) {
    return plannerEmbeddingProviders.value[providerId]
  }

  function getProviderMetadata(providerId: string) {
    const metadata = providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Planner embedding provider metadata for ${providerId} not found`)

    return {
      ...metadata,
      localizedName: metadata.name,
      localizedDescription: metadata.description,
    }
  }

  async function getProviderInstance<R extends
  | ChatProvider
  | ChatProviderWithExtraOptions
  | EmbedProvider
  | EmbedProviderWithExtraOptions
  | SpeechProvider
  | SpeechProviderWithExtraOptions
  | TranscriptionProvider
  | TranscriptionProviderWithExtraOptions,
  >(providerId: string): Promise<R> {
    const cached = providerInstanceCache.value[providerId] as R | undefined
    if (cached)
      return cached

    const metadata = providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Planner embedding provider metadata for ${providerId} not found`)

    const config = plannerEmbeddingProviders.value[providerId]
    if (!config)
      throw new Error(`Planner embedding provider credentials for ${providerId} not found`)

    const instance = await metadata.createProvider(config) as R
    providerInstanceCache.value[providerId] = instance
    return instance
  }

  async function disposeProviderInstance(providerId: string) {
    const instance = providerInstanceCache.value[providerId] as { dispose?: () => Promise<void> | void } | undefined
    if (instance?.dispose)
      await instance.dispose()

    delete providerInstanceCache.value[providerId]
  }

  function forceProviderConfigured(providerId: string) {
    if (providerRuntimeState.value[providerId]) {
      providerRuntimeState.value[providerId].isConfigured = true
      const config = plannerEmbeddingProviders.value[providerId]
      if (config) {
        providerRuntimeState.value[providerId].validatedCredentialHash = JSON.stringify(config)
      }
    }
    markProviderAdded(providerId)
  }

  function isProviderConfigDirty(providerId: string) {
    const config = plannerEmbeddingProviders.value[providerId]
    if (!config)
      return false

    const defaultOptions = getDefaultProviderConfig(providerId)
    return JSON.stringify(config) !== JSON.stringify(defaultOptions)
  }

  function shouldListProvider(providerId: string) {
    return !!addedPlannerEmbeddingProviders.value[providerId] || isProviderConfigDirty(providerId)
  }

  function deleteProvider(providerId: string) {
    delete plannerEmbeddingProviders.value[providerId]
    delete providerRuntimeState.value[providerId]
    unmarkProviderAdded(providerId)
  }

  async function resetProviderSettings() {
    plannerEmbeddingProviders.value = {}
    addedPlannerEmbeddingProviders.value = {}
    providerRuntimeState.value = {}

    Object.keys(providerMetadata).forEach(initializeProvider)
    await updateConfigurationStatus()
  }

  const allPlannerEmbeddingProvidersMetadata = computed(() => {
    const providerList = Object.values(providerMetadata)
    return providerList.map(metadata => ({
      ...metadata,
      localizedName: metadata.name,
      localizedDescription: metadata.description,
      configured: providerRuntimeState.value[metadata.id]?.isConfigured || false,
    }))
  })

  const configuredPlannerEmbeddingProvidersMetadata = computed(() => {
    return allPlannerEmbeddingProvidersMetadata.value.filter(metadata => embeddingConfiguredProviders.value[metadata.id])
  })

  const persistedPlannerEmbeddingProvidersMetadata = computed(() => {
    return allPlannerEmbeddingProvidersMetadata.value.filter(metadata => shouldListProvider(metadata.id))
  })

  Object.keys(providerMetadata).forEach(initializeProvider)

  watch(plannerEmbeddingProviders, updateConfigurationStatus, { deep: true, immediate: true })
  watch(plannerEmbeddingProviders, (newCreds) => {
    const changedProviders: string[] = []
    for (const providerId in newCreds) {
      const currentHash = JSON.stringify(newCreds[providerId])
      const previousHash = previousCredentialHashes.value[providerId]
      if (currentHash !== previousHash) {
        changedProviders.push(providerId)
        previousCredentialHashes.value[providerId] = currentHash
      }
    }

    for (const providerId of changedProviders) {
      void disposeProviderInstance(providerId)
      if (providerRuntimeState.value[providerId]?.isConfigured && providerMetadata[providerId]?.capabilities.listModels) {
        fetchModelsForProvider(providerId)
      }
    }
  }, { deep: true, immediate: true })

  return {
    plannerEmbeddingProviders,
    addedPlannerEmbeddingProviders,
    providerMetadata,
    getProviderMetadata,
    embeddingConfiguredProviders,
    embeddingAvailableModels,
    embeddingIsLoadingModels,
    embeddingModelLoadError,
    allPlannerEmbeddingProvidersMetadata,
    configuredPlannerEmbeddingProvidersMetadata,
    persistedPlannerEmbeddingProvidersMetadata,
    initializeProvider,
    validateProvider,
    fetchModelsForProvider,
    getModelsForProvider,
    getProviderConfig,
    getProviderInstance,
    disposeProviderInstance,
    forceProviderConfigured,
    markProviderAdded,
    unmarkProviderAdded,
    deleteProvider,
    resetProviderSettings,
  }
})
