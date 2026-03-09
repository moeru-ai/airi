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

import { computedAsync, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import type { ModelInfo, ProviderMetadata, ProviderRuntimeState } from './providers'

import { useProvidersStore } from './providers'

export const usePlannerProvidersStore = defineStore('planner-providers', () => {
  const providersStore = useProvidersStore()
  const plannerProviders = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers-planner', {})
  const addedPlannerProviders = useLocalStorage<Record<string, boolean>>('settings/providers/planner/added', {})
  const providerRuntimeState = ref<Record<string, ProviderRuntimeState>>({})
  const providerInstanceCache = ref<Record<string, unknown>>({})
  const previousCredentialHashes = ref<Record<string, string>>({})

  const plannerConfiguredProviders = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isConfigured
    }
    return result
  })

  const plannerAvailableModels = computed(() => {
    const result: Record<string, ModelInfo[]> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.models
    }
    return result
  })

  const plannerIsLoadingModels = computed(() => {
    const result: Record<string, boolean> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.isLoadingModels
    }
    return result
  })

  const plannerModelLoadError = computed(() => {
    const result: Record<string, string | null> = {}
    for (const [key, state] of Object.entries(providerRuntimeState.value)) {
      result[key] = state.modelLoadError
    }
    return result
  })

  function getDefaultProviderConfig(providerId: string) {
    const metadata = providersStore.providerMetadata[providerId]
    const defaultOptions = metadata?.defaultOptions?.() || {}
    return {
      ...defaultOptions,
      ...(Object.prototype.hasOwnProperty.call(defaultOptions, 'baseUrl') ? {} : { baseUrl: '' }),
    }
  }

  function initializeProvider(providerId: string) {
    if (!plannerProviders.value[providerId]) {
      plannerProviders.value[providerId] = getDefaultProviderConfig(providerId)
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
    addedPlannerProviders.value[providerId] = true
  }

  function unmarkProviderAdded(providerId: string) {
    delete addedPlannerProviders.value[providerId]
  }

  async function validateProvider(providerId: string): Promise<boolean> {
    const metadata = providersStore.providerMetadata[providerId]
    if (!metadata)
      return false

    if (providerId === 'browser-web-speech-api' && !plannerProviders.value[providerId]) {
      plannerProviders.value[providerId] = getDefaultProviderConfig(providerId)
    }

    const config = plannerProviders.value[providerId]
    if (!config && providerId !== 'browser-web-speech-api')
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
      if (validationResult.valid && ['browser-web-speech-api', 'player2'].includes(providerId)) {
        markProviderAdded(providerId)
      }
    }
    return validationResult.valid
  }

  async function updateConfigurationStatus() {
    await Promise.all(Object.keys(providersStore.providerMetadata).map(async (providerId) => {
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
    const config = plannerProviders.value[providerId]
    if (!config)
      return []

    const metadata = providersStore.providerMetadata[providerId]
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
      console.error(`Error fetching planner models for ${providerId}:`, error)
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
    return plannerProviders.value[providerId]
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

    const metadata = providersStore.providerMetadata[providerId]
    if (!metadata)
      throw new Error(`Provider metadata for ${providerId} not found`)

    let config = plannerProviders.value[providerId]
    if (!config && providerId === 'browser-web-speech-api') {
      config = getDefaultProviderConfig(providerId)
      plannerProviders.value[providerId] = config
    }

    if (!config && providerId !== 'browser-web-speech-api')
      throw new Error(`Planner provider credentials for ${providerId} not found`)

    const instance = await metadata.createProvider(config || {}) as R
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
      const config = plannerProviders.value[providerId]
      if (config) {
        providerRuntimeState.value[providerId].validatedCredentialHash = JSON.stringify(config)
      }
    }
    markProviderAdded(providerId)
  }

  function isProviderConfigDirty(providerId: string) {
    const config = plannerProviders.value[providerId]
    if (!config)
      return false

    const defaultOptions = getDefaultProviderConfig(providerId)
    return JSON.stringify(config) !== JSON.stringify(defaultOptions)
  }

  function shouldListProvider(providerId: string) {
    return !!addedPlannerProviders.value[providerId] || isProviderConfigDirty(providerId)
  }

  function deleteProvider(providerId: string) {
    delete plannerProviders.value[providerId]
    delete providerRuntimeState.value[providerId]
    unmarkProviderAdded(providerId)
  }

  async function resetProviderSettings() {
    plannerProviders.value = {}
    addedPlannerProviders.value = {}
    providerRuntimeState.value = {}

    Object.keys(providersStore.providerMetadata).forEach(initializeProvider)
    await updateConfigurationStatus()
  }

  function buildProviderMetadataList(metadataList: ProviderMetadata[]) {
    return metadataList.map(metadata => ({
      ...metadata,
      configured: providerRuntimeState.value[metadata.id]?.isConfigured || false,
    }))
  }

  const allPlannerProvidersMetadata = computedAsync<ProviderMetadata[]>(async () => {
    const providers: ProviderMetadata[] = []
    const localizedProviders = Object.keys(providersStore.providerMetadata)
      .map(providerId => providersStore.getProviderMetadata(providerId))

    for (const provider of localizedProviders) {
      const isAvailableBy = provider.isAvailableBy || (() => true)
      const isAvailable = await isAvailableBy()
      if (isAvailable) {
        providers.push(provider)
      }
    }

    return buildProviderMetadataList(providers)
  }, [])

  const allPlannerChatProvidersMetadata = computed(() => {
    return allPlannerProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  const configuredPlannerChatProvidersMetadata = computed(() => {
    return allPlannerChatProvidersMetadata.value.filter(metadata => plannerConfiguredProviders.value[metadata.id])
  })

  const persistedPlannerProvidersMetadata = computed(() => {
    return allPlannerProvidersMetadata.value.filter(metadata => shouldListProvider(metadata.id))
  })

  const persistedPlannerChatProvidersMetadata = computed(() => {
    return persistedPlannerProvidersMetadata.value.filter(metadata => metadata.category === 'chat')
  })

  Object.keys(providersStore.providerMetadata).forEach(initializeProvider)

  watch(plannerProviders, updateConfigurationStatus, { deep: true, immediate: true })
  watch(plannerProviders, (newCreds) => {
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
      if (providerRuntimeState.value[providerId]?.isConfigured && providersStore.providerMetadata[providerId]?.capabilities.listModels) {
        fetchModelsForProvider(providerId)
      }
    }
  }, { deep: true, immediate: true })

  return {
    plannerProviders,
    addedPlannerProviders,
    providerMetadata: providersStore.providerMetadata,
    getProviderMetadata: providersStore.getProviderMetadata,
    plannerConfiguredProviders,
    plannerAvailableModels,
    plannerIsLoadingModels,
    plannerModelLoadError,
    allPlannerProvidersMetadata,
    allPlannerChatProvidersMetadata,
    configuredPlannerChatProvidersMetadata,
    persistedPlannerProvidersMetadata,
    persistedPlannerChatProvidersMetadata,
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
