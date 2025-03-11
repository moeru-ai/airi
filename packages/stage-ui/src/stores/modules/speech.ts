import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { Voice, voiceList, voiceMap } from '../../constants/elevenlabs'
import { useProvidersStore } from '../providers'

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProvidersStore()

  // State
  const activeSpeechProvider = useLocalStorage('settings/speech/active-provider', '')
  const activeSpeechModel = useLocalStorage('settings/speech/active-model', 'eleven_multilingual_v2')
  const voiceName = useLocalStorage('settings/speech/voice-name', '')
  const voiceId = useLocalStorage('settings/speech/voice-id', '')
  const pitch = useLocalStorage('settings/speech/pitch', 0)
  const rate = useLocalStorage('settings/speech/rate', 1)
  const ssmlEnabled = useLocalStorage('settings/speech/ssml-enabled', false)
  const isLoadingSpeechProviderVoices = ref(false)
  const speechProviderError = ref<string | null>(null)
  const availableVoices = ref<Record<string, VoiceInfo[]>>({})
  const selectedLanguage = useLocalStorage('settings/speech/language', 'en-US')

  // Voice info interface
  interface VoiceInfo {
    id: string
    name: string
    provider: string
    description?: string
    gender?: string
    previewUrl?: string
    language?: string
  }

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

  // Actions
  function setActiveSpeechProvider(provider: string) {
    activeSpeechProvider.value = provider
  }

  function setActiveSpeechModel(model: string) {
    activeSpeechModel.value = model
  }

  function setVoiceName(name: string) {
    voiceName.value = name

    // If this is a preset voice, also set the voiceId
    for (const voiceEnum in voiceMap) {
      if (voiceEnum === name) {
        voiceId.value = voiceMap[voiceEnum as Voice]
        break
      }
    }
  }

  function setVoiceId(id: string) {
    voiceId.value = id

    // Try to find the corresponding voice name
    for (const voiceEnum in voiceMap) {
      if (voiceMap[voiceEnum as Voice] === id) {
        voiceName.value = voiceEnum
        break
      }
    }
  }

  function setPitch(value: number) {
    pitch.value = value
  }

  function setRate(value: number) {
    rate.value = value
  }

  function setSSMLEnabled(enabled: boolean) {
    ssmlEnabled.value = enabled
  }

  function setLanguage(language: string) {
    selectedLanguage.value = language
  }

  function resetVoiceSettings() {
    voiceName.value = ''
    voiceId.value = ''
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
      // In a real implementation, you would fetch voices from the provider
      // For now, we'll use our predefined voices for ElevenLabs
      await new Promise(resolve => setTimeout(resolve, 500))

      if (provider === 'elevenlabs') {
        // Use the predefined voices from elevenlabs.ts
        const allVoices: VoiceInfo[] = []

        for (const language in voiceList) {
          const voices = voiceList[language]
          for (const voice of voices) {
            allVoices.push({
              id: voiceMap[voice],
              name: voice,
              provider: 'elevenlabs',
              language,
              description: getVoiceDescription(voice),
              gender: getVoiceGender(voice),
            })
          }
        }

        availableVoices.value[provider] = allVoices
      }
      else if (provider === 'microsoft') {
        availableVoices.value[provider] = [
          {
            id: 'en-US-AriaNeural',
            name: 'Aria',
            provider: 'microsoft',
            description: 'Microsoft neural voice (female)',
            gender: 'female',
            language: 'en-US',
          },
          {
            id: 'en-US-GuyNeural',
            name: 'Guy',
            provider: 'microsoft',
            description: 'Microsoft neural voice (male)',
            gender: 'male',
            language: 'en-US',
          },
        ]
      }
      else {
        // For other providers, return an empty array for now
        availableVoices.value[provider] = []
      }

      return availableVoices.value[provider]
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

  // Helper function to get voice descriptions
  function getVoiceDescription(voice: string): string {
    const descriptions: Record<string, string> = {
      [Voice.Myriam]: 'Professional female voice with clear articulation',
      [Voice.Beatrice]: 'Mature and sophisticated female voice',
      [Voice.Camilla_KM]: 'Friendly and approachable female voice',
      [Voice.SallySunshine]: 'Cheerful and upbeat female voice',
      [Voice.Annie]: 'Young and energetic female voice',
      [Voice.KawaiiAerisita]: 'Cute and playful female voice',
      [Voice.Morioki]: 'Deep and authoritative Japanese male voice',
    }

    return descriptions[voice as Voice] || 'ElevenLabs voice'
  }

  // Helper function to get voice gender
  function getVoiceGender(voice: string): string {
    const maleVoices = [Voice.Morioki]
    return maleVoices.includes(voice as Voice) ? 'male' : 'female'
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
    voiceId,
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

    // Actions
    setActiveSpeechProvider,
    setActiveSpeechModel,
    setVoiceName,
    setVoiceId,
    setPitch,
    setRate,
    setSSMLEnabled,
    setLanguage,
    resetVoiceSettings,
    loadVoicesForProvider,
    getVoicesForProvider,
    generateSSML,
    isSpeechProvider,
  }
})
