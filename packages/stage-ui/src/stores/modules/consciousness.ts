import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useProvidersStore } from '../providers'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProvidersStore()

  // State - Set zunvra.com as default provider
  const activeProvider = useLocalStorage('settings/consciousness/active-provider', 'sofia-zunvra')
  const activeModel = useLocalStorage('settings/consciousness/active-model', 'llama3.2:latest')
  const activeCustomModelName = useLocalStorage('settings/consciousness/active-custom-model', '')
  const expandedDescriptions = ref<Record<string, boolean>>({})
  const modelSearchQuery = ref('')

  console.warn('Consciousness store initialized')
  console.warn('Active provider:', activeProvider.value)
  console.warn('Active model:', activeModel.value)

  // Ensure sensible defaults when localStorage contains empty values
  // This prevents components from calling getProviderInstance('') when
  // the stored value is an empty string.
  if (!activeProvider.value || typeof activeProvider.value !== 'string' || !activeProvider.value.trim()) {
    activeProvider.value = 'sofia-zunvra'
    console.warn('Consciousness store: activeProvider was empty  defaulting to', activeProvider.value)
  }

  if (!activeModel.value || typeof activeModel.value !== 'string' || !activeModel.value.trim()) {
    activeModel.value = 'llama3.2:latest'
    console.warn('Consciousness store: activeModel was empty  defaulting to', activeModel.value)
  }

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
  }
})
