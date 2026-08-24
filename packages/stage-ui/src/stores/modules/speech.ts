import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type {} from 'pinia-plugin-synced'

import type { VoiceInfo } from '../providers/provider'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { isEqual } from 'es-toolkit'
import { defineStore, storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

import { getDefaultSpeechModel, getDefaultStreamingModel, OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, setupOfficialSpeechAutoPick } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'

export function toSignedPercent(value: number): string {
  if (value > 0)
    return `+${value}%`
  if (value < 0)
    return `-${Math.abs(value)}%`
  return '0%'
}

interface SpeechInputOptions {
  text: string
  voice: VoiceInfo
  providerConfig?: Record<string, unknown>
  forceSSML?: boolean
  supportsSSML?: boolean
}

interface SpeechInput {
  input: string
  providerConfig: Record<string, unknown>
}

interface SpeechAnalytics {
  trigger: 'auto' | 'manual'
  source: 'chat_auto_tts' | 'manual_preview' | 'settings_test'
  voice_type?: 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack'
}

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProviderStore()
  const providerStore = useProviderConfigStore()
  const { allAudioSpeechProvidersMetadata } = storeToRefs(providersStore)
  const { locale } = useI18n()

  // Pinia synchronization owns live cross-window state. localStorage only
  // loads and saves durable values for this synchronized store.
  const persistenceOptions = { listenToStorageChanges: false }

  // State
  const activeSpeechProvider = useLocalStorageManualReset<string>('settings/speech/active-provider', 'speech-noop', persistenceOptions)
  const activeSpeechModel = useLocalStorageManualReset<string>('settings/speech/active-model', '', persistenceOptions)
  const activeSpeechVoiceId = useLocalStorageManualReset<string>('settings/speech/voice', '', persistenceOptions)
  const activeSpeechVoice = refManualReset<VoiceInfo | undefined>(undefined)

  const pitch = useLocalStorageManualReset<number>('settings/speech/pitch', 0, persistenceOptions)
  const rate = useLocalStorageManualReset<number>('settings/speech/rate', 1, persistenceOptions)
  const ssmlEnabled = useLocalStorageManualReset<boolean>('settings/speech/ssml-enabled', false, persistenceOptions)
  const isLoadingSpeechProviderVoices = refManualReset<boolean>(false)
  const speechProviderError = refManualReset<string | null>(null)
  const availableVoices = refManualReset<Record<string, VoiceInfo[]>>(() => ({}))
  const modelSearchQuery = refManualReset<string>('')

  // Computed properties
  const availableSpeechProvidersMetadata = computed(() => allAudioSpeechProvidersMetadata.value)

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.supportsModelListing(activeSpeechProvider.value)
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
    return ['elevenlabs', 'microsoft-speech', 'azure-speech'].includes(activeSpeechProvider.value)
  })

  async function loadVoicesForProvider(provider: string, model?: string) {
    if (!provider) {
      return []
    }

    // Streaming provider visibility is server-driven and only confirmed after
    // the auth probe force-configures it. Keep the gate at the public loader so
    // pages cannot bypass it and issue `/voices/streaming` while unavailable.
    if (provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && !providerStore.configuredProviders[provider]) {
      return []
    }

    isLoadingSpeechProviderVoices.value = true
    speechProviderError.value = null

    try {
      const voices = await providersStore.listProviderVoices(provider, model)
      // Reassign to trigger reactivity when adding/updating provider entries
      availableVoices.value = {
        ...availableVoices.value,
        [provider]: voices,
      }
      return voices
    }
    catch (error) {
      console.error(`Error fetching voices for ${provider}:`, error)
      speechProviderError.value = errorMessageFrom(error) ?? 'Unknown error'
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

  function clearVoiceSelection() {
    activeSpeechVoiceId.value = ''
    activeSpeechVoice.value = undefined
  }

  // Streaming TTS voices are model-scoped: the server only returns recommended
  // voices for an explicit `?model=`. Ensure the active model is a valid
  // streaming model id so voice loading gets the right recommendations (parity
  // with the HTTP provider's auto-pick). Reseeds the server-curated default
  // both when no model is selected AND when `activeSpeechModel` still holds a
  // stale id from a previously-active provider (the global model ref is shared
  // across providers, and the per-surface reset may not have run yet). No-op
  // for non-streaming providers.
  function ensureStreamingDefaultModel() {
    if (activeSpeechProvider.value !== OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
      return
    const streamingModels = providersStore.getModelsForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    const hasValidSelection = !!activeSpeechModel.value && streamingModels.some(m => m.id === activeSpeechModel.value)
    if (hasValidSelection)
      return
    // Replace an empty/stale (non-streaming) selection with the server default.
    // When no default can be resolved yet (catalog not loaded), clear it to ''
    // so callers pass `undefined` (server returns the full streaming catalog)
    // rather than forwarding a stale non-streaming model id as `?model=`.
    const nextModel = getDefaultStreamingModel() ?? streamingModels[0]?.id ?? ''
    if (activeSpeechModel.value === nextModel)
      return
    activeSpeechModel.value = nextModel
    // The previously-selected voice belonged to the stale/empty model context,
    // so drop it; auto-pick re-picks a recommended voice for the new model.
    clearVoiceSelection()
  }

  function ensureActiveSpeechModel() {
    ensureStreamingDefaultModel()

    if (activeSpeechProvider.value !== OFFICIAL_SPEECH_PROVIDER_ID)
      return

    const models = providersStore.getModelsForProvider(OFFICIAL_SPEECH_PROVIDER_ID)
    if (!models.length)
      return

    const hasValidSelection = !!activeSpeechModel.value && models.some(m => m.id === activeSpeechModel.value)
    if (hasValidSelection)
      return

    const defaultModel = getDefaultSpeechModel()
    activeSpeechModel.value = defaultModel && models.some(m => m.id === defaultModel)
      ? defaultModel
      : models[0]?.id ?? ''
    clearVoiceSelection()
  }

  // Watch for provider changes and load voices
  watch(activeSpeechProvider, async (newProvider) => {
    if (!newProvider)
      return
    ensureActiveSpeechModel()
    await loadVoicesForProvider(newProvider, activeSpeechModel.value || undefined)
    // Don't reset voice settings when changing providers to allow for persistence
  }, {
    // REVIEW: should we always load voices on init? What will happen when network is not available?
    immediate: true,
  })

  if (!activeSpeechProvider.value) {
    activeSpeechProvider.value = 'speech-noop'
  }

  setupOfficialSpeechAutoPick({
    activeSpeechProvider,
    activeSpeechVoiceId,
    availableVoices,
    uiLocale: locale,
  })

  watch([activeSpeechVoiceId, availableVoices], ([voiceId, voices]) => {
    if (!voiceId)
      return

    let nextVoice: VoiceInfo | undefined
    if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
      nextVoice = {
        id: voiceId,
        name: voiceId,
        description: voiceId,
        previewURL: '',
        languages: [{ code: 'en', title: 'English' }],
        provider: activeSpeechProvider.value,
        gender: 'neutral',
      }
    }
    else {
      nextVoice = voices[activeSpeechProvider.value]?.find(voice => voice.id === voiceId)
    }

    if (!nextVoice || isEqual(activeSpeechVoice.value, nextVoice))
      return

    activeSpeechVoice.value = nextVoice
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
    analytics: SpeechAnalytics = {
      trigger: 'manual',
      source: 'manual_preview',
      voice_type: resolveVoiceType(voice),
    },
  ): Promise<ArrayBuffer> {
    const requestProviderConfig = activeSpeechProvider.value === OFFICIAL_SPEECH_PROVIDER_ID
      || activeSpeechProvider.value === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
      ? withAiriTtsAnalytics(providerConfig, analytics)
      : providerConfig
    const response = await generateSpeech({
      ...provider.speech(model, requestProviderConfig),
      input,
      voice,
    })

    return response
  }

  function withAiriTtsAnalytics(
    providerConfig: Record<string, any>,
    analytics: SpeechAnalytics,
  ): Record<string, any> {
    return {
      ...providerConfig,
      extraBody: {
        ...(providerConfig.extraBody as Record<string, unknown> | undefined),
        airi_analytics: analytics,
      },
    }
  }

  /**
   * Classifies the active speech voice before forwarding analytics to the server.
   */
  function resolveVoiceType(voiceId: string): 'official_selected' | 'custom_configured' {
    const catalogVoice = availableVoices.value[activeSpeechProvider.value]?.some(voice => voice.id === voiceId)
    return activeSpeechProvider.value === OFFICIAL_SPEECH_PROVIDER_ID && catalogVoice ? 'official_selected' : 'custom_configured'
  }

  function generateSSML(
    text: string,
    voice: VoiceInfo,
    providerConfig?: Record<string, unknown>,
  ): string {
    const pitch = providerConfig?.pitch
    const speed = providerConfig?.speed
    const volume = providerConfig?.volume

    const prosody = {
      pitch: typeof pitch === 'number'
        ? toSignedPercent(pitch)
        : undefined,
      rate: typeof speed === 'number'
        ? speed !== 1.0
          ? `${speed}`
          : '1'
        : undefined,
      volume: typeof volume === 'number'
        ? toSignedPercent(volume)
        : undefined,
    }

    const hasProsody = Object.values(prosody).some(value => value != null)

    const ssmlXast = x('speak', { 'version': '1.0', 'xmlns': 'http://www.w3.org/2001/10/synthesis', 'xml:lang': voice.languages[0]?.code || 'en-US' }, [
      x('voice', { name: voice.id, gender: voice.gender || 'neutral' }, [
        hasProsody
          ? x('prosody', {
              pitch: prosody.pitch,
              rate: prosody.rate,
              volume: prosody.volume,
            }, [
              text,
            ])
          : text,
      ]),
    ])

    return toXml(ssmlXast)
  }

  function resolveSpeechInput(options: SpeechInputOptions): SpeechInput {
    const providerConfig = { ...options.providerConfig }
    const canUseSSML = options.supportsSSML === true

    return {
      input: options.forceSSML === true && canUseSSML
        ? generateSSML(options.text, options.voice, providerConfig)
        : options.text,
      providerConfig,
    }
  }

  const configured = computed(() => {
    if (activeSpeechProvider.value === 'speech-noop')
      return false

    if (!activeSpeechProvider.value)
      return false

    let hasModel = !!activeSpeechModel.value
    let hasVoice = !!activeSpeechVoiceId.value

    // For OpenAI Compatible providers, check provider config as fallback
    if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
      const providerConfig = providerStore.getProviderConfig(activeSpeechProvider.value)
      hasModel ||= !!providerConfig?.model
      hasVoice ||= !!providerConfig?.voice
    }

    return hasModel && hasVoice
  })

  function resetState() {
    activeSpeechProvider.reset()
    activeSpeechModel.reset()
    activeSpeechVoiceId.reset()
    activeSpeechVoice.reset()
    pitch.reset()
    rate.reset()
    ssmlEnabled.reset()
    modelSearchQuery.reset()
    availableVoices.reset()
    speechProviderError.reset()
    isLoadingSpeechProviderVoices.reset()
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
    ensureStreamingDefaultModel,
    ensureActiveSpeechModel,
    generateSSML,
    resolveSpeechInput,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})
