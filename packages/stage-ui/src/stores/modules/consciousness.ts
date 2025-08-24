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
  const isCheckingModel = ref(false)
  const modelCheckError = ref<string | null>(null)

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
    activeModel.value = ''
    activeCustomModelName.value = ''
    expandedDescriptions.value = {}
    modelSearchQuery.value = ''
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

  async function checkModelAvailability(provider: string, model: string) {
    if (!provider || !model) return false
    
    const metadata = providersStore.getProviderMetadata(provider)
    if (!metadata?.capabilities.checkModel) return true // Skip check if not supported
    
    try {
      isCheckingModel.value = true
      modelCheckError.value = null
      
      const result = await metadata.capabilities.checkModel(model)
      return result
    } catch (error) {
      modelCheckError.value = error instanceof Error ? error.message : 'Unknown error'
      return false
    } finally {
      isCheckingModel.value = false
    }
  }

  // Watch for model changes and check availability
  watch([activeProvider, activeModel], async ([newProvider, newModel], [oldProvider, oldModel]) => {
    if (newProvider && newModel && (newProvider !== oldProvider || newModel !== oldModel)) {
      const isAvailable = await checkModelAvailability(newProvider, newModel)
      if (!isAvailable && modelCheckError.value) {
        console.warn(`Model ${newModel} is not available for provider ${newProvider}:`, modelCheckError.value)
      }
    }
  })

  const configured = computed(() => {
    return !!activeProvider.value && !!activeModel.value
  })

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
    expandedDescriptions,
    modelSearchQuery,
    isCheckingModel,
    modelCheckError,

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
    checkModelAvailability,
  }
})
