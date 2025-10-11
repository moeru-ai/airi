import type { VisionProvider, VisionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useLocalStorage } from '@vueuse/core'
import { generateVisionAnalysis } from '@xsai/generate-vision'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useProvidersStore } from '../providers'

export const useVisionStore = defineStore('vision-store', () => {
  const providersStore = useProvidersStore()
  const { allVisionProvidersMetadata, configuredProviders } = storeToRefs(providersStore)

  // State
  const activeVisionProvider = useLocalStorage('settings/vision/active-provider', '')
  const activeVisionModel = useLocalStorage('settings/vision/active-model', '')
  const activeCustomModelName = useLocalStorage('settings/vision/active-custom-model', '')
  const visionModelSearchQuery = ref('')
  const enableCameraCapture = useLocalStorage('settings/vision/enable-camera-capture', false)
  const enableScreenCapture = useLocalStorage('settings/vision/enable-screen-capture', false)
  const autoAnalyzeOnCapture = useLocalStorage('settings/vision/auto-analyze-on-capture', true)

  const defaultVisionProvider = import.meta.env?.DEFAULT_VISION_PROVIDER?.trim() || 'openai-vision'

  if (
    defaultVisionProvider
    && Object.prototype.hasOwnProperty.call(providersStore.providerMetadata, defaultVisionProvider)
  ) {
    watch(
      () => configuredProviders.value[defaultVisionProvider],
      (isConfigured) => {
        if (isConfigured && !activeVisionProvider.value)
          activeVisionProvider.value = defaultVisionProvider
      },
      { immediate: true },
    )
  }

  watch(activeVisionProvider, (provider) => {
    if (!provider)
      return

    const envModel = providersStore.getEnvModelForProvider?.(provider)
    if (envModel && (!activeVisionModel.value || activeVisionModel.value.trim().length === 0))
      activeVisionModel.value = envModel
  }, { immediate: true })

  // Computed properties
  const availableProvidersMetadata = computed(() => allVisionProvidersMetadata.value)

  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeVisionProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return activeVisionProvider.value
      ? providersStore.getProviderModels(VisionProvider, activeVisionProvider.value)
      : []
  })

  const filteredProviderModels = computed(() => {
    let filteredModels = providerModels.value

    if (visionModelSearchQuery.value) {
      const searchQuery = visionModelSearchQuery.value.toLowerCase().trim()
      filteredModels = filteredModels.filter(model =>
        model.id.toLowerCase().includes(searchQuery)
        || model.name?.toLowerCase().includes(searchQuery)
        || model.description?.toLowerCase().includes(searchQuery),
      )
    }

    return filteredModels
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isProviderModelsLoading(activeVisionProvider.value)
  })

  const configured = computed(() => {
    return !!activeVisionProvider.value
      && !!activeVisionModel.value
      && configuredProviders.value[activeVisionProvider.value]
  })

  const activeProviderModelError = computed(() => {
    return providersStore.getProviderModelValidation(activeVisionProvider.value, activeVisionModel.value) || ''
  })

  // Actions
  async function loadModelsForProvider(providerId: string) {
    await providersStore.fetchModelsForProvider(VisionProvider, providerId)
  }

  async function analyzeImage(imageUrl: string, prompt?: string, options?: VisionProviderWithExtraOptions) {
    if (!configured.value)
      throw new Error('Vision provider not configured')

    const providerOptions = {
      ...options,
      providerId: activeVisionProvider.value,
      model: activeVisionModel.value,
    }

    return generateVisionAnalysis(imageUrl, prompt || 'Describe this image in detail.', providerOptions)
  }

  async function analyzeImageDirect(imageData: Blob | ArrayBuffer | string, prompt?: string, options?: VisionProviderWithExtraOptions) {
    if (!configured.value)
      throw new Error('Vision provider not configured')

    const providerOptions = {
      ...options,
      providerId: activeVisionProvider.value,
      model: activeVisionModel.value,
    }

    return generateVisionAnalysis(imageData, prompt || 'Describe this image in detail.', providerOptions)
  }

  return {
    // State
    activeVisionProvider,
    activeVisionModel,
    activeCustomModelName,
    visionModelSearchQuery,
    enableCameraCapture,
    enableScreenCapture,
    autoAnalyzeOnCapture,

    // Computed
    availableProvidersMetadata,
    supportsModelListing,
    providerModels,
    filteredProviderModels,
    isLoadingActiveProviderModels,
    configured,
    activeProviderModelError,

    // Actions
    loadModelsForProvider,
    analyzeImage,
    analyzeImageDirect,
  }
})
