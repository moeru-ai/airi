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
    if (provider && providersStore.getProviderMetadata(activeProvider.value)?.capabilities.listModels !== undefined
      && providersStore.getModelsForProvider(provider).length === 0) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  let player2Interval: ReturnType<typeof setInterval> | undefined
  // Watch for provider changes and load models
  watch(activeProvider, async (newProvider) => {
    await loadModelsForProvider(newProvider)
    resetModelSelection()

    if (newProvider === 'player2') {
      // Ping heal check every 60 seconds if Player2 is being used
      player2Interval = setInterval(() => {
        // eslint-disable-next-line no-console
        console.log('Sending Player2 Health check if it is being used')
        fetch(`localhost:4315/v1/health`, {
          method: 'GET',
          headers: {
            'player2-game-key': 'airi',
          },
        })
          .catch(() => { })
      }, 60_000)
    }
    else {
      if (player2Interval)
        clearInterval(player2Interval)
      player2Interval = undefined
    }
  })

  return {
    // State
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
  }
})
