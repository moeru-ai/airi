import type { VoiceInfo } from '../providers'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import { voiceList, voiceMap } from '../../constants/elevenlabs'
import { useProvidersStore } from '../providers'

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProvidersStore()

  // State
  const activeSpeechProvider = useLocalStorage('settings/speech/active-provider', '')
  const activeSpeechModel = useLocalStorage('settings/speech/active-model', 'eleven_multilingual_v2')
  const activeSpeechVoiceId = useLocalStorage<string>('settings/speech/voice', '')
  const activeSpeechVoice = ref<VoiceInfo>()

  const pitch = useLocalStorage('settings/speech/pitch', 0)
  const rate = useLocalStorage('settings/speech/rate', 1)
  const ssmlEnabled = useLocalStorage('settings/speech/ssml-enabled', false)
  const isLoadingSpeechProviderVoices = ref(false)
  const speechProviderError = ref<string | null>(null)
  const availableVoices = ref<Record<string, VoiceInfo[]>>({})
  const selectedLanguage = useLocalStorage('settings/speech/language', 'en-US')
  const modelSearchQuery = ref('')

  // Computed properties
  const availableSpeechProvidersMetadata = computed(() => {
    // Filter only speech providers from all available providers
    return providersStore.availableProviders
      .filter(id => isSpeechProvider(id))
      .map(id => providersStore.getProviderMetadata(id))
  })

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeSpeechProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeSpeechProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeSpeechProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeSpeechProvider.value] || null
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

  const supportsSSML = computed(() => {
    // Currently only ElevenLabs and some other providers support SSML
    return ['elevenlabs', 'microsoft-speech', 'azure-speech', 'google'].includes(activeSpeechProvider.value)
  })

  const availableLanguages = computed(() => {
    return Object.keys(voiceList)
  })

  const availableVoicesForLanguage = computed(() => {
    const language = selectedLanguage.value
    if (!language || !voiceList[language]) {
      return []
    }

    return voiceList[language].map(voiceEnum => ({
      id: voiceMap[voiceEnum],
      name: voiceEnum,
      provider: 'elevenlabs',
      language,
    }))
  })

  // Helper function to determine if a provider is a speech provider
  function isSpeechProvider(providerId: string): boolean {
    // This is a simplified check - in a real implementation, you might have a more robust way
    // to determine if a provider supports speech synthesis
    return ['elevenlabs', 'microsoft-speech', 'azure-speech', 'google', 'amazon'].includes(providerId)
  }

  async function loadVoicesForProvider(provider: string) {
    if (!provider || !isSpeechProvider(provider)) {
      return []
    }

    isLoadingSpeechProviderVoices.value = true
    speechProviderError.value = null

    try {
      const voices = await providersStore.getProviderMetadata(provider).capabilities.listVoices?.(providersStore.getProviderConfig(provider)) || []
      availableVoices.value[provider] = voices
      return voices
    }
    catch (error) {
      console.error(`Error fetching voices for ${provider}:`, error)
      speechProviderError.value = error instanceof Error ? error.message : 'Unknown error'
      return []
    }
    finally {
      isLoadingSpeechProviderVoices.value = false
    }
  }

  // Get voices for a specific provider
  function getVoicesForProvider(provider: string) {
    return availableVoices.value[provider] || []
  }

  // Watch for provider changes and load voices
  watch(activeSpeechProvider, async (newProvider) => {
    if (newProvider) {
      await loadVoicesForProvider(newProvider)
      // Don't reset voice settings when changing providers to allow for persistence
    }
  })

  // Generate SSML from plain text and voice settings
  function generateSSML(text: string, voice: VoiceInfo): string {
    const pitchValue = pitch.value > 0 ? `+${pitch.value}%` : `${pitch.value}%`

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.languages[0].code}">
  <voice name="${voice.id}" gender="${voice.gender}">
    <prosody pitch="${pitchValue}">
      ${text}
    </prosody>
  </voice>
</speak>`
  }

  onMounted(() => {
    if (activeSpeechVoiceId.value) {
      activeSpeechVoice.value = availableVoices.value[activeSpeechProvider.value]?.find(voice => voice.id === activeSpeechVoiceId.value)
    }
  })

  watch(activeSpeechVoice, (voice) => {
    if (voice) {
      activeSpeechVoiceId.value = voice.id
    }
  })

  return {
    // State
    activeSpeechProvider,
    activeSpeechModel,
    activeSpeechVoice,
    pitch,
    rate,
    ssmlEnabled,
    selectedLanguage,
    isLoadingSpeechProviderVoices,
    speechProviderError,
    availableVoices,
    modelSearchQuery,

    // Computed
    availableSpeechProvidersMetadata,
    supportsSSML,
    availableLanguages,
    availableVoicesForLanguage,
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    filteredModels,

    // Actions
    loadVoicesForProvider,
    getVoicesForProvider,
    generateSSML,
    isSpeechProvider,
  }
})
