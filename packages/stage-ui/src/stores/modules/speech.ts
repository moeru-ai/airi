import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import type { VoiceInfo } from '../providers'

import { generateSpeech } from '@xsai/generate-speech'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

import { createResettableLocalStorage, createResettableRef } from '../../utils/resettable'
import { useProvidersStore } from '../providers'

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProvidersStore()
  const { allAudioSpeechProvidersMetadata } = storeToRefs(providersStore)

  // State
  const [activeSpeechProvider, resetActiveSpeechProvider] = createResettableLocalStorage('settings/speech/active-provider', '')
  const [activeSpeechModel, resetActiveSpeechModel] = createResettableLocalStorage('settings/speech/active-model', 'eleven_multilingual_v2')
  const [activeSpeechVoiceId, resetActiveSpeechVoiceId] = createResettableLocalStorage<string>('settings/speech/voice', '')
  const [activeSpeechVoice, resetActiveSpeechVoice] = createResettableRef<VoiceInfo | undefined>(undefined)

  const [pitch, resetPitch] = createResettableLocalStorage('settings/speech/pitch', 0)
  const [rate, resetRate] = createResettableLocalStorage('settings/speech/rate', 1)
  const [ssmlEnabled, resetSsmlEnabled] = createResettableLocalStorage('settings/speech/ssml-enabled', false)
  const [isLoadingSpeechProviderVoices, resetIsLoadingSpeechProviderVoices] = createResettableRef(false)
  const [speechProviderError, resetSpeechProviderError] = createResettableRef<string | null>(null)
  const [availableVoices, resetAvailableVoices] = createResettableRef<Record<string, VoiceInfo[]>>({})
  const [selectedLanguage, resetSelectedLanguage] = createResettableLocalStorage('settings/speech/language', 'en-US')
  const [modelSearchQuery, resetModelSearchQuery] = createResettableRef('')

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
    // only part voices are support SSML in cosyvoice-v2 which is provided by alibaba
    if (activeSpeechProvider.value === 'alibaba-cloud-model-studio' && activeSpeechModel.value === 'cosyvoice-v2') {
      return true
    }
    return ['elevenlabs', 'microsoft-speech', 'azure-speech', 'google', 'volcengine'].includes(activeSpeechProvider.value)
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
  }, {
    // REVIEW: should we always load voices on init? What will happen when network is not available?
    immediate: true,
  })

  onMounted(() => {
    loadVoicesForProvider(activeSpeechProvider.value).then(() => {
      if (activeSpeechVoiceId.value) {
        activeSpeechVoice.value = availableVoices.value[activeSpeechProvider.value]?.find(voice => voice.id === activeSpeechVoiceId.value)
      }
    })
  })

  watch([activeSpeechVoiceId, availableVoices], ([voiceId, voices]) => {
    if (voiceId) {
      activeSpeechVoice.value = voices[activeSpeechProvider.value]?.find(voice => voice.id === voiceId)
    }
  }, {
    immediate: true,
    deep: true,
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

  function resetState() {
    resetActiveSpeechProvider()
    resetActiveSpeechModel()
    resetActiveSpeechVoiceId()
    resetActiveSpeechVoice()
    resetPitch()
    resetRate()
    resetSsmlEnabled()
    resetSelectedLanguage()
    resetModelSearchQuery()
    resetAvailableVoices()
    resetSpeechProviderError()
    resetIsLoadingSpeechProviderVoices()
  }

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
    resetState,
  }
})
