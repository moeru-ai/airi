import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage, createResettableRef } from '../../../utils/resettable'
import { useProvidersStore } from '../../providers'

export const useVisionStore = defineStore('vision', () => {
  const providersStore = useProvidersStore()

  const [activeProvider, resetActiveProvider] = createResettableLocalStorage('settings/vision/active-provider', '')
  const [activeModel, resetActiveModel] = createResettableLocalStorage('settings/vision/active-model', '')
  const [activeCustomModelName, resetActiveCustomModelName] = createResettableLocalStorage('settings/vision/active-custom-model', '')
  const [modelSearchQuery, resetModelSearchQuery] = createResettableRef('')

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
    resetActiveModel()
    resetActiveCustomModelName()
    resetModelSearchQuery()
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
    resetActiveProvider()
    resetModelSelection()
  }

  return {
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
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
