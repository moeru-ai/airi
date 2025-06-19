import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

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

  // Watch for provider changes and load models
  watch(activeProvider, async (newProvider) => {
    await loadModelsForProvider(newProvider)
    resetModelSelection()
  })

  // every 60 seconds, if there is no active provider, and player2 is available, check if player2 is running if so set it as default:
  let player2Interval: number | null = null

  watch(
    () => providersStore.availableProviders,
    (providers) => {
      if (player2Interval === null && providers.length > 0) {
        player2Interval = window.setInterval(async () => {
          if (
            providers.includes('player2')
            && !activeProvider.value.length
          ) {
            try {
              const res = await fetch('http://localhost:4315/v1/health')
              if (res.ok) {
                // eslint-disable-next-line no-console
                console.log('No provider selected & player2 is running, setting player2 as provider')
                activeProvider.value = 'player2'
                if (player2Interval !== null) {
                  clearInterval(player2Interval)
                  player2Interval = null
                }
              }
            }
            catch {}
          }
        }, 5000) // check every 5 seconds
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    // cleans up the player2 interval
    if (player2Interval !== null) {
      clearInterval(player2Interval)
      player2Interval = null
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
