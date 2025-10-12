import type { ChatProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useLocalStorage } from '@vueuse/core'
import { generateImage } from '@xsai/generate-image'
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
      ? providersStore.getModelsForProvider(activeVisionProvider.value)
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
    return providersStore.isLoadingModels[activeVisionProvider.value] || false
  })

  const configured = computed(() => {
    return !!activeVisionProvider.value
      && !!activeVisionModel.value
      && configuredProviders.value[activeVisionProvider.value]
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeVisionProvider.value] || ''
  })

  // Actions
  async function loadModelsForProvider(providerId: string) {
    if (providerId && providersStore.getProviderMetadata(providerId)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(providerId)
    }
  }

  async function analyzeImage(imageUrl: string, prompt?: string, options?: ChatProviderWithExtraOptions<string, any>) {
    if (!configured.value)
      throw new Error('Vision provider not configured')

    const provider = providersStore.getProviderMetadata(activeVisionProvider.value)
    if (!provider)
      throw new Error(`Provider not found: ${activeVisionProvider.value}`)

    const providerInstance = await providersStore.getProviderInstance(provider.id)
    if (!providerInstance?.vision)
      throw new Error('Vision function not available for this provider')

    const result = await generateImage({
      ...providerInstance.vision(activeVisionModel.value, {
        ...options,
      }),
      input: imageUrl,
      prompt: prompt || 'Describe this image in detail.',
    })

    // Ensure consistent return structure
    if (typeof result === 'string') {
      return { content: result }
    }

    return result || { content: 'Analysis failed: No response received' }
  }

  async function analyzeImageDirect(imageData: Blob | ArrayBuffer | string, prompt?: string, options?: ChatProviderWithExtraOptions<string, any>) {
    if (!configured.value)
      throw new Error('Vision provider not configured')

    const provider = providersStore.getProviderMetadata(activeVisionProvider.value)
    if (!provider)
      throw new Error(`Provider not found: ${activeVisionProvider.value}`)

    const providerInstance = await providersStore.getProviderInstance(provider.id)
    if (!providerInstance?.vision)
      throw new Error('Vision function not available for this provider')

    const result = await generateImage({
      ...providerInstance.vision(activeVisionModel.value, {
        ...options,
      }),
      input: imageData,
      prompt: prompt || 'Describe this image in detail.',
    })

    // Ensure consistent return structure
    if (typeof result === 'string') {
      return { content: result }
    }

    return result || { content: 'Analysis failed: No response received' }
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
