import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useProviderStore } from '../../providers/provider'
import { useVisionSettingsStore } from './settings'

export const useVisionStore = defineStore('vision', () => {
  const providersStore = useProviderStore()
  const settings = useVisionSettingsStore()

  // Persist the startup choice without replicating this window's active character settings.
  const persistenceOptions = { listenToStorageChanges: false }

  const activeProvider = useLocalStorageManualReset('settings/vision/active-provider', '', persistenceOptions)
  const activeModel = useLocalStorageManualReset('settings/vision/active-model', '', persistenceOptions)
  const activeCustomModelName = useLocalStorageManualReset('settings/vision/active-custom-model', '', persistenceOptions)
  const ollamaThinkingEnabled = computed(() => settings.ollamaThinkingEnabled)
  const useForChat = computed(() => settings.useForChat)
  const modelSearchQuery = refManualReset('')

  const supportsModelListing = computed(() => {
    return providersStore.supportsModelListing(activeProvider.value)
  })

  const providerModels = computed(() => {
    if (!activeProvider.value)
      return []

    return providersStore.getModelsForProvider(activeProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    if (!activeProvider.value)
      return false

    return providersStore.isLoadingModels[activeProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    if (!activeProvider.value)
      return null

    return providersStore.modelLoadError[activeProvider.value] || null
  })

  const configured = computed(() => {
    return !!activeProvider.value && !!activeModel.value
  })

  function resetModelSelection() {
    activeModel.reset()
    activeCustomModelName.reset()
    modelSearchQuery.reset()
  }

  async function loadModelsForProvider(provider: string) {
    if (providersStore.supportsModelListing(provider)) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (providersStore.supportsModelListing(provider)) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  async function resetState() {
    activeProvider.reset()
    resetModelSelection()
    await settings.setUseForChat(true)
  }

  return {
    useForChat,
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
    ollamaThinkingEnabled,
    modelSearchQuery,

    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    resetModelSelection,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})
