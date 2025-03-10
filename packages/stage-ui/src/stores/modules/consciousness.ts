import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useProvidersStore } from '../providers'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProvidersStore()

  // State
  const activeProvider = useLocalStorage('settings/consciousness/active-provider', '')
  const activeModel = useLocalStorage('settings/consciousness/active-model', '')
  const activeCustomModelName = useLocalStorage('settings/consciousness/active-custom-model', '')
  const expandedDescriptions = ref<Record<string, boolean>>({})
  const modelSearchQuery = ref('')

  // Computed properties
  const availableProvidersMetadata = computed(() => {
    return providersStore.availableProviders.map(id => providersStore.getProviderMetadata(id))
  })

  const supportsModelListing = computed(() => {
    return providersStore.supportsModelListing(activeProvider.value)
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

  // Actions
  function setActiveProvider(provider: string) {
    activeProvider.value = provider
  }

  function setActiveModel(model: string) {
    activeModel.value = model
  }

  function setCustomModelName(name: string) {
    activeCustomModelName.value = name
  }

  function setModelSearchQuery(query: string) {
    modelSearchQuery.value = query
  }

  function resetModelSelection() {
    activeModel.value = ''
    activeCustomModelName.value = ''
    expandedDescriptions.value = {}
    modelSearchQuery.value = ''
  }

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.supportsModelListing(provider)
      && providersStore.getModelsForProvider(provider).length === 0) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  // Watch for provider changes and load models
  watch(activeProvider, async (newProvider) => {
    await loadModelsForProvider(newProvider)
    resetModelSelection()
  })

  return {
    // State
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
    expandedDescriptions,
    modelSearchQuery,

    // Computed
    availableProvidersMetadata,
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    filteredModels,

    // Actions
    setActiveProvider,
    setActiveModel,
    setCustomModelName,
    setModelSearchQuery,
    resetModelSelection,
    loadModelsForProvider,
  }
})
