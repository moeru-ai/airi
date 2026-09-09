import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type {} from 'pinia-plugin-synced'

import type { VoiceCatalogConfiguration, VoiceInfo } from '../providers/provider'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { isEqual } from 'es-toolkit'
import { defineStore, getActivePinia, storeToRefs } from 'pinia'
import { computed, hasInjectionContext, inject, onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { getDefaultSpeechModel, OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, pickOfficialSpeechVoice } from '../../libs/providers/providers/official'
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

// Request status belongs to this renderer's RPC wait, not to replicated speech settings.
const useSpeechCatalogRequests = defineStore('speech-catalog-requests', () => {
  const status = refManualReset<Record<string, { loading: boolean, error: string | null }>>(() => ({}))
  return { status }
})

export const useSpeechStore = defineStore('speech', () => {
  const pinia = getActivePinia()
  const runtime = hasInjectionContext() ? inject(injectKeyPiniaSynced, undefined) : undefined
  const catalogRequests = useSpeechCatalogRequests()
  const { status: voiceCatalogStatus } = storeToRefs(catalogRequests)
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
  // Each provider owns its latest request status. Settings for the active
  // provider and background provider editors must not consume each other's IO.
  const isLoadingSpeechProviderVoices = computed(() => voiceCatalogStatus.value[activeSpeechProvider.value]?.loading ?? false)
  const speechProviderError = computed(() => voiceCatalogStatus.value[activeSpeechProvider.value]?.error ?? null)
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

  // Only leader loads own these counters. Older responses for a provider cannot
  // replace its newer catalog. Caller request status has separate local ownership.
  let voiceLoadSequence = 0
  const latestVoiceLoads = new Map<string, number>()

  let localRequestSequence = 0
  let disposed = false
  const localRequests = new Map<string, { sequence: number, model?: string }>()
  const cancelPending = new Set<() => void>()

  /** Captures configuration and tracks this renderer's cancelable RPC wait. */
  async function loadVoicesForProvider(provider: string, model?: string): Promise<VoiceInfo[]> {
    if (!provider || disposed)
      return []
    const sequence = ++localRequestSequence
    localRequests.set(provider, { sequence, model })
    voiceCatalogStatus.value = { ...voiceCatalogStatus.value, [provider]: { loading: true, error: null } }
    let cancel!: () => void
    const interrupted = new Promise<VoiceInfo[]>((resolve) => {
      cancel = () => resolve([])
    })
    cancelPending.add(cancel)
    let errorMessage: string | null = null
    try {
      const configuration = providersStore.getVoiceCatalogConfiguration(provider)
      return await Promise.race([
        useSpeechStore(pinia).loadVoiceCatalog(provider, model, configuration),
        interrupted,
      ])
    }
    catch (error) {
      if (localRequests.get(provider)?.sequence === sequence) {
        errorMessage = errorMessageFrom(error) ?? 'Unknown error'
        console.error('Failed to load speech voice catalog:', errorMessage)
      }
      return []
    }
    finally {
      cancelPending.delete(cancel)
      if (localRequests.get(provider)?.sequence === sequence) {
        localRequests.delete(provider)
        voiceCatalogStatus.value = { ...voiceCatalogStatus.value, [provider]: { loading: false, error: errorMessage } }
      }
    }
  }

  /** Releases local waiters and invalidates results owned by the outgoing leader. */
  function cancelCatalogRequests() {
    localRequests.clear()
    latestVoiceLoads.clear()
    for (const cancel of cancelPending)
      cancel()
    cancelPending.clear()
    voiceCatalogStatus.value = {}
  }

  let observedLeader = runtime?.getLeaderId()
  const stopCoordination = runtime?.onCoordinationChange(({ leaderId }) => {
    // Participant heartbeats do not change request ownership. Wait for an
    // elected replacement before restarting; a gap in election is not a leader.
    if (!leaderId || leaderId === observedLeader)
      return
    if (!observedLeader) {
      // Initial election routes the startup watchers' pending calls normally.
      observedLeader = leaderId
      return
    }
    observedLeader = leaderId
    const reloads = new Map(Array.from(localRequests, ([provider, request]) => [provider, request.model]))
    // The current selection takes precedence over an interrupted preview model.
    if (activeSpeechProvider.value)
      reloads.set(activeSpeechProvider.value, activeSpeechModel.value || undefined)
    cancelCatalogRequests()
    // Let the election callback finish before routing replacement RPCs.
    // Each renderer restarts its own active queries.
    void Promise.resolve().then(() => {
      if (disposed || observedLeader !== leaderId)
        return
      for (const [provider, model] of reloads)
        void loadVoicesForProvider(provider, model)
    })
  })
  onScopeDispose(() => {
    disposed = true
    stopCoordination?.()
    cancelCatalogRequests()
  })

  /** Executes a caller's immutable catalog request in the synchronization leader. */
  async function loadVoiceCatalog(provider: string, model: string | undefined, configuration: VoiceCatalogConfiguration): Promise<VoiceInfo[]> {
    if (!provider || disposed) {
      return []
    }

    // Streaming provider visibility is server-driven and only confirmed after
    // the auth probe force-configures it. Keep the gate at the public loader so
    // pages cannot bypass it and issue `/voices/streaming` while unavailable.
    if (provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && !providerStore.configuredProviders[provider]) {
      return []
    }

    if (provider === activeSpeechProvider.value) {
      ensureActiveSpeechModel()
      model ??= activeSpeechModel.value || undefined
    }

    const loadSequence = ++voiceLoadSequence
    latestVoiceLoads.set(provider, loadSequence)
    // A replacement catalog may belong to another model. Do not let auto-pick
    // choose from the old response while the new request is pending or fails.
    availableVoices.value = { ...availableVoices.value, [provider]: [] }

    const voices = await providersStore.listProviderVoices(provider, model, configuration)
    // Undefined is an expired session. A cleared sequence also rejects work
    // from an outgoing leader or a reset, even if its network response arrives.
    if (voices === undefined || latestVoiceLoads.get(provider) !== loadSequence)
      return []
    availableVoices.value = { ...availableVoices.value, [provider]: voices }
    return voices
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
    const nextModel = providersStore.getDefaultModelForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID) ?? streamingModels[0]?.id ?? ''
    if (activeSpeechModel.value === nextModel)
      return
    activeSpeechModel.value = nextModel
    // The previously-selected voice belonged to the stale/empty model context,
    // so drop it; auto-pick re-picks a recommended voice for the new model.
    clearVoiceSelection()
  }

  // A provider that publishes one model publishes no choice. An empty selection
  // keeps `configured` false until the user opens the dropdown and picks that
  // one entry, and the provider looks broken until then. This applies to every
  // single-model speech provider, not only to the VOICEVOX family.
  //
  // The voice selection stays as it is. Voices belong to the provider, not to
  // this model, and a provider switch clears both before this runs.
  function ensureSingleOptionSpeechModel() {
    const models = providersStore.getModelsForProvider(activeSpeechProvider.value)
    if (models.length !== 1)
      return

    const onlyModelId = models[0]?.id ?? ''
    if (!onlyModelId || activeSpeechModel.value === onlyModelId)
      return

    activeSpeechModel.value = onlyModelId
  }

  function ensureActiveSpeechModel() {
    ensureStreamingDefaultModel()

    if (activeSpeechProvider.value !== OFFICIAL_SPEECH_PROVIDER_ID) {
      ensureSingleOptionSpeechModel()
      return
    }

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

  // Provider and model form the catalog identity, including changes made by cards.
  // Watch both here so loading does not depend on an open settings page. Credential policy
  // belongs to the provider boundary, so this module stays auth-agnostic.
  watch([activeSpeechProvider, activeSpeechModel], async ([newProvider, newModel], _, onCleanup) => {
    if (!newProvider)
      return
    let stale = false
    onCleanup(() => {
      stale = true
    })
    // Immediate watchers run before Pinia installs action wrappers. Wait for
    // setup, then use this store's Pinia instance, even if another app is active.
    await Promise.resolve()
    if (stale)
      return
    await useSpeechStore(pinia).loadVoicesForProvider(newProvider, newModel || undefined)
    // Don't reset voice settings when changing providers to allow for persistence
  }, {
    // REVIEW: should we always load voices on init? What will happen when network is not available?
    immediate: true,
  })

  if (!activeSpeechProvider.value) {
    activeSpeechProvider.value = 'speech-noop'
  }

  // Snapshots may wake every renderer. Only the leader may apply the selection
  // and its derived voice object; the action is idempotent for repeated calls.
  watch([activeSpeechProvider, activeSpeechVoiceId, availableVoices], async () => {
    await Promise.resolve()
    try {
      await useSpeechStore(pinia).ensureActiveSpeechVoice()
    }
    catch (error) {
      console.error('Failed to route speech voice selection:', errorMessageFrom(error))
    }
  }, { immediate: true, deep: true })

  /** Applies official recommendations and the matching voice object in the leader. */
  async function ensureActiveSpeechVoice() {
    if (disposed)
      return
    const selected = pickOfficialSpeechVoice({
      activeSpeechProvider: activeSpeechProvider.value,
      activeSpeechVoiceId: activeSpeechVoiceId.value,
      availableVoices: availableVoices.value,
      uiLocale: locale.value,
    })
    if (selected)
      activeSpeechVoiceId.value = selected
    const voiceId = activeSpeechVoiceId.value
    const voices = availableVoices.value
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
  }

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

  /** Resets shared settings in the leader and rejects catalog results started before this reset. */
  async function resetState() {
    // Invalidate request ownership before the reset publishes new settings.
    cancelCatalogRequests()
    activeSpeechProvider.reset()
    activeSpeechModel.reset()
    activeSpeechVoiceId.reset()
    activeSpeechVoice.reset()
    pitch.reset()
    rate.reset()
    ssmlEnabled.reset()
    modelSearchQuery.reset()
    availableVoices.reset()
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
    voiceCatalogStatus: computed(() => voiceCatalogStatus.value),
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
    loadVoiceCatalog,
    ensureActiveSpeechVoice,
    getVoicesForProvider,
    ensureStreamingDefaultModel,
    ensureActiveSpeechModel,
    generateSSML,
    resolveSpeechInput,
    resetState,
  }
}, {
  synced: {
    actions: ['loadVoiceCatalog', 'ensureActiveSpeechVoice', 'resetState'],
    state: true,
  },
})
