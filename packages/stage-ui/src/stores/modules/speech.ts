import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { VoiceInfo } from '../providers'
import type { VoicePackParams, VoicePackSnapshot } from './airi-card'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

import { getDefaultStreamingModel, OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, setupOfficialSpeechAutoPick } from '../../libs/providers/providers/official'
import { useProvidersStore } from '../providers'

export function toSignedPercent(value: number): string {
  if (value > 0)
    return `+${value}%`
  if (value < 0)
    return `-${Math.abs(value)}%`
  return '0%'
}

interface VoicePackSpeechInputOptions {
  text: string
  voice: VoiceInfo
  providerConfig?: Record<string, unknown>
  params?: VoicePackParams
  voicePack?: Pick<VoicePackSnapshot, 'packId' | 'costMultiplier'>
  forceSSML?: boolean
  supportsSSML?: boolean
  supportsAdapterProsody?: boolean
}

interface VoicePackSpeechInput {
  input: string
  providerConfig: Record<string, unknown>
}

const voicePackSupportedParams = new Set(['pitch', 'rate', 'volume'])

/**
 * Normalizes a Voice Pack percent-style option.
 *
 * Before:
 * - "+20%"
 * - "-10%"
 * - 15
 *
 * After:
 * - 20
 * - -10
 * - 15
 */
function normalizePercentOption(value: string | number | boolean | null | undefined, name: string): number | undefined {
  if (value == null)
    return undefined

  if (typeof value === 'number') {
    if (Number.isFinite(value))
      return value
    throw new Error(`Voice Pack parameter "${name}" must be a finite number.`)
  }

  if (typeof value !== 'string')
    throw new Error(`Voice Pack parameter "${name}" must be a number or percent string.`)

  const trimmed = value.trim()
  const normalized = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed))
    throw new Error(`Voice Pack parameter "${name}" must be a number or percent string.`)

  return parsed
}

/**
 * Normalizes a Voice Pack rate option into provider speed.
 *
 * Before:
 * - "+20%"
 * - "-10%"
 * - 1.2
 *
 * After:
 * - 1.2
 * - 0.9
 * - 1.2
 */
function normalizeRateOption(value: string | number | boolean | null | undefined): number | undefined {
  if (value == null)
    return undefined

  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0)
      return value
    throw new Error('Voice Pack parameter "rate" must be a positive finite number or percent string.')
  }

  if (typeof value !== 'string')
    throw new Error('Voice Pack parameter "rate" must be a positive finite number or percent string.')

  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const percent = normalizePercentOption(trimmed, 'rate')
    const speed = 1 + (percent ?? 0) / 100
    if (speed > 0)
      return speed
    throw new Error('Voice Pack parameter "rate" percent must resolve to a positive speed.')
  }

  const parsed = Number(trimmed)
  if (Number.isFinite(parsed) && parsed > 0)
    return parsed

  throw new Error('Voice Pack parameter "rate" must be a positive finite number or percent string.')
}

function assertSupportedVoicePackParams(params: VoicePackParams | undefined) {
  if (!params)
    return

  for (const [key, value] of Object.entries(params)) {
    if (value == null)
      continue

    if (!voicePackSupportedParams.has(key))
      throw new Error(`Unsupported Voice Pack parameter "${key}".`)
  }
}

export const useSpeechStore = defineStore('speech', () => {
  const providersStore = useProvidersStore()
  const { allAudioSpeechProvidersMetadata } = storeToRefs(providersStore)
  const { locale } = useI18n()

  // State
  const activeSpeechProvider = useLocalStorageManualReset<string>('settings/speech/active-provider', 'speech-noop')
  const activeSpeechModel = useLocalStorageManualReset<string>('settings/speech/active-model', '')
  const activeSpeechVoiceId = useLocalStorageManualReset<string>('settings/speech/voice', '')
  const activeSpeechVoice = refManualReset<VoiceInfo | undefined>(undefined)

  const pitch = useLocalStorageManualReset<number>('settings/speech/pitch', 0)
  const rate = useLocalStorageManualReset<number>('settings/speech/rate', 1)
  const ssmlEnabled = useLocalStorageManualReset<boolean>('settings/speech/ssml-enabled', false)
  const isLoadingSpeechProviderVoices = refManualReset<boolean>(false)
  const speechProviderError = refManualReset<string | null>(null)
  const availableVoices = refManualReset<Record<string, VoiceInfo[]>>(() => ({}))
  const modelSearchQuery = refManualReset<string>('')

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
    return ['elevenlabs', 'microsoft-speech', 'azure-speech'].includes(activeSpeechProvider.value)
  })

  async function loadVoicesForProvider(provider: string, model?: string) {
    if (!provider) {
      return []
    }

    // Streaming provider visibility is server-driven and only confirmed after
    // the auth probe force-configures it. Keep the gate at the public loader so
    // pages cannot bypass it and issue `/voices/streaming` while unavailable.
    if (provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && !providersStore.configuredProviders[provider]) {
      return []
    }

    isLoadingSpeechProviderVoices.value = true
    speechProviderError.value = null

    try {
      const voices = await providersStore.getProviderMetadata(provider).capabilities.listVoices?.(providersStore.getProviderConfig(provider), model) || []
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

    activeSpeechModel.value = models[0]?.id ?? ''
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

  watch(
    () => providersStore.configuredSpeechProvidersMetadata.map(provider => provider.id),
    (configuredProviderIds) => {
      if (!activeSpeechProvider.value || activeSpeechProvider.value === 'speech-noop')
        return

      // NOTICE: only reset when the provider has actually been validated and found unconfigured.
      // Skip reset if validation hasn't run yet (validatedCredentialHash is undefined)
      // to avoid a race condition where immediate watcher fires before async validation completes.
      const runtimeState = providersStore.providerRuntimeState[activeSpeechProvider.value]
      if (runtimeState && runtimeState.validatedCredentialHash === undefined)
        return

      // NOTICE: clear stale selection when the currently selected speech provider
      // is no longer configured to avoid implicit fallback behavior from persisted state.
      // NOTE: Do NOT use { immediate: true } here — providers.ts validates credentials
      // asynchronously on startup, so firing immediately would see an empty
      // configuredSpeechProvidersMetadata and incorrectly reset activeSpeechProvider
      // to 'speech-noop', permanently wiping the persisted selection from localStorage.
      if (!configuredProviderIds.includes(activeSpeechProvider.value)) {
        activeSpeechProvider.value = 'speech-noop'
        activeSpeechModel.value = ''
        activeSpeechVoiceId.value = ''
        activeSpeechVoice.value = undefined
      }
    },
  )

  onMounted(() => {
    ensureActiveSpeechModel()
    loadVoicesForProvider(activeSpeechProvider.value, activeSpeechModel.value || undefined).then(() => {
      if (activeSpeechVoiceId.value) {
        activeSpeechVoice.value = availableVoices.value[activeSpeechProvider.value]?.find(voice => voice.id === activeSpeechVoiceId.value)
      }
    })
  })

  setupOfficialSpeechAutoPick({
    activeSpeechProvider,
    activeSpeechVoiceId,
    availableVoices,
    uiLocale: locale,
  })

  watch(providerModels, () => {
    ensureActiveSpeechModel()
  })

  watch([activeSpeechVoiceId, availableVoices], ([voiceId, voices]) => {
    if (voiceId) {
      // For OpenAI Compatible, create a custom voice object (no voices available from API)
      if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
        // Always update to match voiceId (in case it changed)
        activeSpeechVoice.value = {
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
        // For other providers, find voice in available voices
        const foundVoice = voices[activeSpeechProvider.value]?.find(voice => voice.id === voiceId)
        // Only update if we found a voice, or if activeSpeechVoice is not set
        if (foundVoice || !activeSpeechVoice.value) {
          activeSpeechVoice.value = foundVoice
        }
      }
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
    const requestProviderConfig = activeSpeechProvider.value === OFFICIAL_SPEECH_PROVIDER_ID
      || activeSpeechProvider.value === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
      ? withAiriTtsAnalytics(providerConfig, {
          trigger: 'manual',
          source: 'manual_preview',
        })
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
    analytics: { trigger: 'auto' | 'manual', source: 'chat_auto_tts' | 'manual_preview' | 'settings_test' },
  ): Record<string, any> {
    return {
      ...providerConfig,
      extraBody: {
        ...(providerConfig.extraBody as Record<string, unknown> | undefined),
        airi_analytics: analytics,
      },
    }
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

  function resolveVoicePackSpeechInput(options: VoicePackSpeechInputOptions): VoicePackSpeechInput {
    const providerConfig = { ...options.providerConfig }

    if (!options.params) {
      return {
        input: options.forceSSML
          ? generateSSML(options.text, options.voice, providerConfig)
          : options.text,
        providerConfig,
      }
    }

    assertSupportedVoicePackParams(options.params)

    const pitch = normalizePercentOption(options.params.pitch, 'pitch')
    const volume = normalizePercentOption(options.params.volume, 'volume')
    const speed = normalizeRateOption(options.params.rate)
    const needsProsody = pitch != null || volume != null

    if (speed != null)
      providerConfig.speed = speed

    if (options.voicePack) {
      providerConfig.extraBody = {
        ...(providerConfig.extraBody as Record<string, unknown> | undefined),
        voice_pack: {
          pack_id: options.voicePack.packId,
          cost_multiplier: options.voicePack.costMultiplier,
          ...(needsProsody && options.supportsAdapterProsody
            ? { pitch, volume }
            : {}),
        },
      }
    }
    else if (needsProsody && options.supportsAdapterProsody) {
      providerConfig.extraBody = {
        ...(providerConfig.extraBody as Record<string, unknown> | undefined),
        voice_pack: { pitch, volume },
      }
    }
    else if (needsProsody && !options.forceSSML && !options.supportsSSML) {
      throw new Error('Voice Pack pitch and volume parameters require an SSML-capable speech provider.')
    }

    if (!options.forceSSML && (!needsProsody || options.supportsAdapterProsody)) {
      return {
        input: options.text,
        providerConfig,
      }
    }

    const ssmlConfig = { ...providerConfig }
    if (pitch != null)
      ssmlConfig.pitch = pitch
    if (volume != null)
      ssmlConfig.volume = volume

    return {
      input: generateSSML(options.text, options.voice, ssmlConfig),
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
      const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
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
    resolveVoicePackSpeechInput,
    resetState,
  }
})
