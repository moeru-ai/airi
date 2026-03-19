import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useProvidersStore } from '../../providers'

export const useVisionStore = defineStore('vision', () => {
  const providersStore = useProvidersStore()

  const activeProvider = useLocalStorageManualReset('settings/vision/active-provider', '')
  const activeModel = useLocalStorageManualReset('settings/vision/active-model', '')
  const activeCustomModelName = useLocalStorageManualReset('settings/vision/active-custom-model', '')
  const ollamaThinkingEnabled = useLocalStorageManualReset('settings/vision/ollama-thinking-enabled', false)
  const modelSearchQuery = refManualReset('')

  const providerMetadata = computed(() => {
    if (!activeProvider.value)
      return null

    return providersStore.providerMetadata[activeProvider.value] ?? null
  })

  const supportsModelListing = computed(() => {
    return providerMetadata.value?.capabilities.listModels !== undefined
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
    if (provider && providerMetadata.value?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providerMetadata.value?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  function resetState() {
    activeProvider.reset()
    resetModelSelection()
  }

  return {
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
