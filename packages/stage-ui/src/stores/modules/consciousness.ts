import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useProvidersStore } from '../providers'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProvidersStore()
  const { configuredProviders } = storeToRefs(providersStore)

  // State
  const activeProvider = useLocalStorage('settings/consciousness/active-provider', '')
  const activeModel = useLocalStorage('settings/consciousness/active-model', '')
  const activeCustomModelName = useLocalStorage('settings/consciousness/active-custom-model', '')
  const expandedDescriptions = ref<Record<string, boolean>>({})
  const modelSearchQuery = ref('')

  const defaultChatProvider = (import.meta.env.DEFAULT_CHAT_PROVIDER || '').trim()

  if (
    defaultChatProvider
    && Object.prototype.hasOwnProperty.call(providersStore.providerMetadata, defaultChatProvider)
  ) {
    watch(
      () => configuredProviders.value[defaultChatProvider],
      (isConfigured) => {
        if (isConfigured && !activeProvider.value)
          activeProvider.value = defaultChatProvider
      },
      { immediate: true },
    )
  }

  watch(activeProvider, (provider) => {
    if (!provider)
      return

    const envModel = providersStore.getEnvModelForProvider?.(provider)
    if (envModel && (!activeModel.value || activeModel.value.trim().length === 0))
      activeModel.value = envModel
  }, { immediate: true })

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
