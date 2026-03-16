import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useProvidersStore } from '../providers'

export const useVisionModuleStore = defineStore('vision-module', () => {
  const providersStore = useProvidersStore()
  const { allVisionProvidersMetadata } = storeToRefs(providersStore)

  const enabled = useLocalStorageManualReset<boolean>('settings/vision/enabled', false)
  const activeVisionProvider = useLocalStorageManualReset<string>('settings/vision/active-provider', '')
  const activeVisionModel = useLocalStorageManualReset<string>('settings/vision/active-model', '')
  const autoCaptureEnabled = useLocalStorageManualReset<boolean>('settings/vision/auto-capture-enabled', false)
  const autoCaptureInterval = useLocalStorageManualReset<number>('settings/vision/auto-capture-interval', 30000)
  const cooldown = useLocalStorageManualReset<number>('settings/vision/cooldown', 5000)

  const availableProvidersMetadata = computed(() => allVisionProvidersMetadata.value)

  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeVisionProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeVisionProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeVisionProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeVisionProvider.value] || null
  })

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
    if (!enabled.value)
      return true

    if (!activeVisionProvider.value)
      return false

    if (!activeVisionModel.value) {
      const providerConfig = providersStore.getProviderConfig(activeVisionProvider.value)
      if (!providerConfig?.model)
        return false
    }

    return true
  })

  function resetState() {
    enabled.reset()
    activeVisionProvider.reset()
    activeVisionModel.reset()
    autoCaptureEnabled.reset()
    autoCaptureInterval.reset()
    cooldown.reset()
  }

  return {
    enabled,
    activeVisionProvider,
    activeVisionModel,
    autoCaptureEnabled,
    autoCaptureInterval,
    cooldown,

    availableProvidersMetadata,
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})
