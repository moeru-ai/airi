import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useLocalStorage } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useProvidersStore } from '../providers'

export const useHearingStore = defineStore('hearing', () => {
  const providersStore = useProvidersStore()
  const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)

  // State
  const activeTranscriptionProvider = useLocalStorage('settings/hearing/active-provider', '')
  const activeTranscriptionModel = useLocalStorage('settings/hearing/active-model', '')

  // Computed properties
  const availableProvidersMetadata = computed(() => allAudioTranscriptionProvidersMetadata.value)

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeTranscriptionProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeTranscriptionProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeTranscriptionProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeTranscriptionProvider.value] || null
  })

  const configured = computed(() => {
    return !!activeTranscriptionProvider.value && !!activeTranscriptionModel.value
  })

  async function transcription(
    provider: TranscriptionProviderWithExtraOptions<string, any>,
    model: string,
    file: File,
    format?: 'json' | 'verbose_json',
  ) {
    const response = await generateTranscription({
      ...provider.transcription(model, { responseFormat: format }),
      file,
      responseFormat: format,
    })

    return response
  }

  return {
    activeTranscriptionProvider,
    activeTranscriptionModel,
    availableProvidersMetadata,

    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    transcription,
  }
})
