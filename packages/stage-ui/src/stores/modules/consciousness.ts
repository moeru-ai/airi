import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useProvidersStore } from '../providers'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProvidersStore()
  const configuratorStore = useConfiguratorByModsChannelServer()

  // State
  const activeProvider = useLocalStorageManualReset<string>('settings/consciousness/active-provider', '')
  const activeModel = useLocalStorageManualReset<string>('settings/consciousness/active-model', '')
  const activeCustomModelName = useLocalStorageManualReset<string>('settings/consciousness/active-custom-model', '')
  const modelSyncTargetModules = useLocalStorageManualReset<string[]>('settings/consciousness/model-sync-target-modules', ['proj-airi:airi-plugin-vscode'])
  const expandedDescriptions = refManualReset<Record<string, boolean>>(() => ({}))
  const modelSearchQuery = refManualReset<string>('')

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
    activeModel.reset()
    activeCustomModelName.reset()
    expandedDescriptions.reset()
    modelSearchQuery.reset()
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

  function resetState() {
    activeProvider.reset()
    resetModelSelection()
  }

  let lastSyncedModelKey = ''

  function syncModelConfigurationTargets() {
    // TODO(@nekomeowww): migrate to provide a shared generateText(...) function through
    // eventa invoke, so that credentials will not leak to plugin side without warning and confirmation.
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    const payload = {
      model: {
        provider: activeProvider.value || undefined,
        model: activeModel.value || undefined,
        baseURL: (providerConfig?.baseUrl as string | undefined)?.trim() || undefined,
        apiKey: (providerConfig?.apiKey as string | undefined)?.trim() || undefined,
      },
    } satisfies Record<string, unknown>

    const nextKey = `${payload.model.provider ?? ''}::${payload.model.model ?? ''}`
    if (nextKey === lastSyncedModelKey) {
      return
    }

    lastSyncedModelKey = nextKey
    for (const moduleName of modelSyncTargetModules.value) {
      configuratorStore.updateForIfAvailable(moduleName, payload)
    }
  }

  watch([activeProvider, activeModel], () => {
    syncModelConfigurationTargets()
  }, { immediate: true })

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
    modelSyncTargetModules,
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
    syncModelConfigurationTargets,
  }
})
