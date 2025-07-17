import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import type { VoiceInfo } from '../providers'

import { useLocalStorage } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

import { useProvidersStore } from '../providers'

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProvidersStore()
  const { allAudioSpeechProvidersMetadata } = storeToRefs(providersStore)

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
  const availableSpeechProvidersMetadata = computed(() => allAudioSpeechProvidersMetadata.value)

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
    return ['elevenlabs', 'microsoft-speech', 'azure-speech', 'google', 'alibaba-cloud-model-studio', 'volcengine'].includes(activeSpeechProvider.value)
  })

  async function loadVoicesForProvider(provider: string) {
    if (!provider) {
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

  onMounted(() => {
    loadVoicesForProvider(activeSpeechProvider.value).then(() => {
      if (activeSpeechVoiceId.value) {
        activeSpeechVoice.value = availableVoices.value[activeSpeechProvider.value]?.find(voice => voice.id === activeSpeechVoiceId.value)
      }
    })
  })

  watch(activeSpeechVoiceId, (voiceId) => {
    if (voiceId) {
      activeSpeechVoice.value = availableVoices.value[activeSpeechProvider.value]?.find(voice => voice.id === voiceId)
    }
  }, {
    immediate: true,
  })

  watch(availableVoices, (voices) => {
    if (activeSpeechVoiceId.value) {
      activeSpeechVoice.value = voices[activeSpeechProvider.value]?.find(voice => voice.id === activeSpeechVoiceId.value)
    }
  }, {
    immediate: true,
  })

  /**
   * Generate speech using the specified provider and settings
   *
   * @param provider The speech provider instance
   * @param model The model to use
   * @param input The text input to convert to speech
   * @param voice The voice ID to use
   * @param providerConfig Additional provider configuration
   * @returns ArrayBuffer containing the audio data
   */
  async function speech(
    provider: SpeechProviderWithExtraOptions<string, any>,
    model: string,
    input: string,
    voice: string,
    providerConfig: Record<string, any> = {},
  ): Promise<ArrayBuffer> {
    const response = await generateSpeech({
      ...provider.speech(model, {
        ...providerConfig,
      }),
      input,
      voice,
    })

    return response
  }

  function generateSSML(
    text: string,
    voice: VoiceInfo,
    providerConfig?: Record<string, any>,
  ): string {
    const pitch = providerConfig?.pitch
    const speed = providerConfig?.speed
    const volume = providerConfig?.volume

    const prosody = {
      pitch: pitch != null
        ? pitch > 0
          ? `+${pitch}%`
          : `-${pitch}%`
        : undefined,
      rate: speed != null
        ? speed !== 1.0
          ? `${speed}`
          : '1'
        : undefined,
      volume: volume != null
        ? volume > 0
          ? `+${volume}%`
          : `${volume}%`
        : undefined,
    }

    const ssmlXast = x('speak', { 'version': '1.0', 'xmlns': 'http://www.w3.org/2001/10/synthesis', 'xml:lang': voice.languages[0]?.code || 'en-US' }, [
      x('voice', { name: voice.id, gender: voice.gender || 'neutral' }, [
        Object.entries(prosody).filter(([_, value]) => value != null).length > 0
          ? x('prosody', {
              pitch: pitch != null ? pitch > 0 ? `+${pitch}%` : `-${pitch}%` : undefined,
              rate: speed != null ? speed !== 1.0 ? `${speed}` : '1' : undefined,
              volume: volume != null ? volume > 0 ? `+${volume}%` : `${volume}%` : undefined,
            }, [
              text,
            ])
          : text,
      ]),
    ])

    return toXml(ssmlXast)
  }

  const configured = computed(() => {
    return !!activeSpeechProvider.value && !!activeSpeechModel.value && !!activeSpeechVoiceId.value
  })

  return {
    // State
    configured,
    activeSpeechProvider,
    activeSpeechModel,
    activeSpeechVoice,
    activeSpeechVoiceId,
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
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    filteredModels,

    // Actions
    speech,
    loadVoicesForProvider,
    getVoicesForProvider,
    generateSSML,
  }
})
