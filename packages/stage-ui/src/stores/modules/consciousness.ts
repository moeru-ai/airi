import type {} from 'pinia-plugin-synced'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { useProviderStore } from '../providers/provider'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProviderStore()

  // Pinia synchronization owns live cross-window state. localStorage remains
  // durable persistence, but storage events must not reflect state back into
  // the store and publish another synchronized snapshot.
  const persistenceOptions = { listenToStorageChanges: false }

  // State
  const activeProvider = useLocalStorageManualReset<string>('settings/consciousness/active-provider', '', persistenceOptions)
  const activeModel = useLocalStorageManualReset<string>('settings/consciousness/active-model', '', persistenceOptions)
  const activeCustomModelName = useLocalStorageManualReset<string>('settings/consciousness/active-custom-model', '', persistenceOptions)
  const expandedDescriptions = refManualReset<Record<string, boolean>>(() => ({}))
  const modelSearchQuery = refManualReset<string>('')

  // Computed properties
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

  const activeTemperature = useLocalStorageManualReset<number>(
    'settings/consciousness/active-temperature',
    0.7,
  )

  const activeTopP = useLocalStorageManualReset<number>(
    'settings/consciousness/active-top-p',
    1.0,
  )

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
    activeModel.reset()
    activeCustomModelName.reset()
    expandedDescriptions.reset()
    modelSearchQuery.reset()
  }

  // A model id belongs to the catalog of the provider it was picked from, so
  // clear the selection whenever the provider changes. This used to live only
  // in the consciousness settings page, so provider changes made elsewhere
  // (onboarding, character cards, provider deletion) kept the previous
  // provider's model and chat requests failed upstream with model_not_found.
  //
  // The watcher is synchronous on purpose: call sites assign the provider
  // first and a new model right after, so a
  // deferred reset would wipe the model they just chose. Synchronous flush
  // makes "set provider, then set model" a safe, ordered operation.
  //
  // Issue #1761: https://github.com/moeru-ai/airi/issues/1761
  watch(activeProvider, (provider, oldProvider) => {
    if (provider === oldProvider)
      return

    activeModel.value = ''
    activeCustomModelName.value = ''
  }, { flush: 'sync' })

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

  const configured = computed(() => {
    return !!activeProvider.value && !!activeModel.value
  })

  function resetState() {
    activeProvider.reset()
    resetModelSelection()
    activeTemperature.reset()
    activeTopP.reset()
  }

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    activeTemperature,
    activeTopP,
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
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})
