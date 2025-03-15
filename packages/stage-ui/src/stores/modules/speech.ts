import type { Voice } from '../fix/voice'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { voiceList, voiceMap } from '../../constants/elevenlabs'
import { useProvidersStore } from '../providers'

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProvidersStore()

  // State
  const activeSpeechProvider = useLocalStorage('settings/speech/active-provider', '')
  const activeSpeechModel = useLocalStorage('settings/speech/active-model', 'eleven_multilingual_v2')
  const voiceName = useLocalStorage('settings/speech/voice-name', '')
  const pitch = useLocalStorage('settings/speech/pitch', 0)
  const rate = useLocalStorage('settings/speech/rate', 1)
  const ssmlEnabled = useLocalStorage('settings/speech/ssml-enabled', false)
  const isLoadingSpeechProviderVoices = ref(false)
  const speechProviderError = ref<string | null>(null)
  const availableVoices = ref<Record<string, Voice[]>>({})
  const selectedLanguage = useLocalStorage('settings/speech/language', 'en-US')

  // Computed properties
  const availableSpeechProvidersMetadata = computed(() => {
    // Filter only speech providers from all available providers
    return providersStore.availableProviders
      .filter(id => isSpeechProvider(id))
      .map(id => providersStore.getProviderMetadata(id))
  })

  const supportsSSML = computed(() => {
    // Currently only ElevenLabs and some other providers support SSML
    return ['elevenlabs', 'microsoft', 'google'].includes(activeSpeechProvider.value)
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
    return ['elevenlabs', 'microsoft', 'google', 'amazon'].includes(providerId)
  }

  function resetVoiceSettings() {
    voiceName.value = ''
    pitch.value = 0
    rate.value = 1
    ssmlEnabled.value = false
  }

  async function loadVoicesForProvider(provider: string) {
    if (!provider || !isSpeechProvider(provider)) {
      return []
    }

    isLoadingSpeechProviderVoices.value = true
    speechProviderError.value = null

    try {
      return await providersStore.getProviderMetadata(provider).capabilities.listVoices?.(providersStore.getProviderConfig(provider)) || []
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

  // Generate SSML for the current configuration
  function generateSSML(text: string): string {
    if (!ssmlEnabled.value) {
      return text
    }

    let ssml = '<speak>'

    if (voiceName.value) {
      ssml += `<voice name="${voiceName.value}">`
    }

    if (pitch.value !== 0 || rate.value !== 1) {
      ssml += `<prosody pitch="+${pitch.value}%" rate="${rate.value}">`
    }

    ssml += text

    if (pitch.value !== 0 || rate.value !== 1) {
      ssml += '</prosody>'
    }

    if (voiceName.value) {
      ssml += '</voice>'
    }

    ssml += '</speak>'

    return ssml
  }

  return {
    // State
    activeSpeechProvider,
    activeSpeechModel,
    voiceName,
    pitch,
    rate,
    ssmlEnabled,
    selectedLanguage,
    isLoadingSpeechProviderVoices,
    speechProviderError,
    availableVoices,

    // Computed
    availableSpeechProvidersMetadata,
    supportsSSML,
    availableLanguages,
    availableVoicesForLanguage,

    resetVoiceSettings,
    loadVoicesForProvider,
    getVoicesForProvider,
    generateSSML,
    isSpeechProvider,
  }
})
