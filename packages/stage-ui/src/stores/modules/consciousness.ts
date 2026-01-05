import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage, createResettableRef } from '../../utils/resettable'
import { useProvidersStore } from '../providers'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProvidersStore()

  // State
  const [activeProvider, resetActiveProvider] = createResettableLocalStorage('settings/consciousness/active-provider', '')
  const [activeModel, resetActiveModel] = createResettableLocalStorage('settings/consciousness/active-model', '')
  const [activeCustomModelName, resetActiveCustomModelName] = createResettableLocalStorage('settings/consciousness/active-custom-model', '')
  const [expandedDescriptions, resetExpandedDescriptions] = createResettableRef<Record<string, boolean>>({})
  const [modelSearchQuery, resetModelSearchQuery] = createResettableRef('')

  // Use custom model name when user selected the "custom" option
  const effectiveModel = computed(() => {
    if (activeModel.value === 'custom') {
      const custom = activeCustomModelName.value.trim()
      return custom || ''
    }
    return activeModel.value
  })

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeProvider.value] || null
  })

  const filteredModels = computed(() => {
    if (!modelSearchQuery.value.trim()) {
      return providerModels.value
    }

    const query = modelSearchQuery.value.toLowerCase().trim()
    return providerModels.value.filter(model =>
      model.name.toLowerCase().includes(query)
      || model.id.toLowerCase().includes(query)
      || (model.description && model.description.toLowerCase().includes(query)),
    )
  })

  function resetModelSelection() {
    resetActiveModel()
    resetActiveCustomModelName()
    resetExpandedDescriptions()
    resetModelSearchQuery()
  }

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    return !!activeProvider.value && !!effectiveModel.value
  })

  function resetState() {
    resetActiveProvider()
    resetModelSelection()
  }

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
    effectiveModel,
    expandedDescriptions,
    modelSearchQuery,

    // Computed
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    filteredModels,

    // Actions
    resetModelSelection,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})
