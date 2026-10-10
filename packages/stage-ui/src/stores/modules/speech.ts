import type { SpeechOutput, TurnRef } from '@proj-airi/core-agent'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type {} from 'pinia-plugin-synced'

import type { SpeechSelection } from '../../services/airi-card-modules'
import type { AiriExtension } from '../../types/airiCard'
import type { VoiceCatalogConfiguration, VoiceCatalogIdentity, VoiceInfo } from '../providers/provider'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { generateSpeech } from '@xsai/generate-speech'
import { isEqual } from 'es-toolkit'
import { defineStore, getActivePinia, storeToRefs } from 'pinia'
import { computed, hasInjectionContext, inject, onScopeDispose, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { getDefinedProvider } from '../../libs/providers/providers'
import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, pickOfficialSpeechVoice } from '../../libs/providers/providers/official'
import { streamSpeech } from '../../libs/speech/streaming-pipeline'
import { getSpeechSelectionState, resolveSpeechOutputSelection } from '../../services/airi-card-modules'
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
  turn_id?: string
}

// Request status belongs to this renderer's RPC wait, not to replicated speech settings.
const useSpeechCatalogRequests = defineStore('speech-catalog-requests', () => {
  const status = refManualReset<Record<string, { loading: boolean, error: string | null }>>(() => ({}))
  return { status }
})

// Only speech's leader actions write this store. Settings proposals cannot
// replace catalogs or roll back the reset generation. A new leader inherits both.
const useSpeechCatalog = defineStore('speech-catalog', () => {
  const availableVoices = refManualReset<Record<string, VoiceInfo[]>>(() => ({}))
  const voiceCatalogIdentities = refManualReset<Record<string, VoiceCatalogIdentity>>(() => ({}))
  const resetGeneration = refManualReset(0)
  return { availableVoices, voiceCatalogIdentities, resetGeneration }
}, { synced: { state: true } })

export const useSpeechStore = defineStore('speech', () => {
  const pinia = getActivePinia()
  const runtime = hasInjectionContext() ? inject(injectKeyPiniaSynced, undefined) : undefined
  const catalog = useSpeechCatalog()
  const { availableVoices, voiceCatalogIdentities, resetGeneration } = storeToRefs(catalog)
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
        useSpeechStore(pinia).loadVoiceCatalog(provider, model, configuration, resetGeneration.value),
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

  // Reset snapshots release local RPC waits in every renderer, including
  // windows that did not initiate the reset. This watcher writes no shared state.
  watch(resetGeneration, cancelCatalogRequests, { flush: 'sync' })

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
  async function loadVoiceCatalog(provider: string, model: string | undefined, configuration: VoiceCatalogConfiguration, generation = resetGeneration.value): Promise<VoiceInfo[]> {
    // A queued caller request from before reset cannot start new leader work.
    if (!provider || disposed || generation !== resetGeneration.value) {
      return []
    }

    // Streaming provider visibility is server-driven and only confirmed after
    // the auth probe force-configures it. Keep the gate at the public loader so
    // pages cannot bypass it and issue `/voices/streaming` while unavailable.
    if (provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && !providerStore.configuredProviders[provider]) {
      return []
    }

    const loadSequence = ++voiceLoadSequence
    latestVoiceLoads.set(provider, loadSequence)
    if (voiceCatalogIdentities.value[provider]?.model !== model) {
      discardVoiceCatalog(provider)
    }
    const identity = await providersStore.getVoiceCatalogIdentity(model, configuration)
    // Hashing yields. Reset, a newer request, or provider ownership changes
    // during that work must not clear or replace a newer catalog.
    if (latestVoiceLoads.get(provider) !== loadSequence || identity.owner !== providersStore.voiceCatalogOwners[identity.definitionId])
      return []
    // Keep valid choices during a refresh. A model or configuration change
    // invalidates them before auto-pick can select from the previous catalog.
    if (!isEqual(voiceCatalogIdentities.value[provider], identity)) {
      discardVoiceCatalog(provider)
    }

    const voices = await providersStore.listProviderVoices(provider, model, configuration)
    // Undefined is an expired session. A cleared sequence also rejects work
    // from an outgoing leader or a reset, even if its network response arrives.
    if (latestVoiceLoads.get(provider) !== loadSequence || identity.owner !== providersStore.voiceCatalogOwners[identity.definitionId])
      return []
    if (voices === undefined) {
      // Session expiry also rejects persisted choices without a cached identity.
      if (!voiceCatalogIdentities.value[provider] && activeSpeechProvider.value === provider)
        clearVoiceSelection()
      discardVoiceCatalog(provider)
      return []
    }
    voiceCatalogIdentities.value = { ...voiceCatalogIdentities.value, [provider]: identity }
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

  /** Drops catalog metadata and its selected voice together; initial discovery preserves unverified persisted choices. */
  function discardVoiceCatalog(provider: string) {
    if (voiceCatalogIdentities.value[provider] && activeSpeechProvider.value === provider)
      clearVoiceSelection()
    delete voiceCatalogIdentities.value[provider]
    availableVoices.value = { ...availableVoices.value, [provider]: [] }
  }

  /** Rejects expired recommendations synchronously before any leader consumer can select them. */
  function discardExpiredVoiceCatalogs() {
    if (disposed)
      return
    for (const [provider, identity] of Object.entries(voiceCatalogIdentities.value)) {
      if (identity.owner === providersStore.voiceCatalogOwners[identity.definitionId])
        continue
      latestVoiceLoads.delete(provider)
      discardVoiceCatalog(provider)
    }
  }

  /** Routes provider ownership notifications to the leader's synchronous invalidation. */
  async function invalidateVoiceCatalogs() {
    discardExpiredVoiceCatalogs()
  }

  watch(() => providersStore.voiceCatalogOwners, async () => {
    // Remote provider snapshots can wake every renderer. Only the exposed
    // leader action may clear shared catalogs, and repeated calls are harmless.
    await Promise.resolve()
    if (disposed)
      return
    try {
      await useSpeechStore(pinia).invalidateVoiceCatalogs()
    }
    catch (error) {
      console.error('Failed to invalidate speech catalogs:', errorMessageFrom(error))
    }
  }, { immediate: true })

  /**
   * Returns a selection from catalog data without changing active speech fields.
   * Official voices use the existing recommendation policy. Third-party voices
   * remain explicit, including custom names absent from a catalog.
   */
  async function resolveSelection(selection: SpeechSelection): Promise<SpeechSelection | undefined> {
    const resolved = resolveSpeechOutputSelection(selection, providerStore.getProviderConfig(selection.provider))
    const provider = resolved.provider
    if (!provider || provider === 'speech-noop')
      return resolved
    const official = provider === OFFICIAL_SPEECH_PROVIDER_ID || provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
    const models = providersStore.getModelsForProvider(provider)
    if ((official || !resolved.model) && !models.length && providersStore.supportsModelListing(provider)) {
      await providersStore.fetchModelsForProvider(provider)
      const error = providersStore.modelLoadError[provider]
      if (error)
        throw new Error(error)
    }
    const catalogModels = providersStore.getModelsForProvider(provider)
    let model = resolved.model
    if (official && !catalogModels.some(candidate => candidate.id === model)) {
      const defaultModel = providersStore.getDefaultModelForProvider(provider)
      model = catalogModels.find(candidate => candidate.id === defaultModel)?.id ?? catalogModels[0]?.id ?? ''
    }
    else if (!model && catalogModels.length === 1) {
      // A single published model retains the existing automatic model policy.
      model = catalogModels[0].id
    }
    let voiceId = official && model !== resolved.model ? '' : resolved.voice_id
    if (provider === 'openai-compatible-audio-speech') {
      model ||= 'tts-1'
      voiceId ||= 'alloy'
    }
    if (official && model && !voiceId) {
      const configuration = providersStore.getVoiceCatalogConfiguration(provider)
      const voices = await providersStore.listProviderVoices(provider, model, configuration)
      // An expired session cannot provide a configuration commit.
      if (voices === undefined)
        return undefined
      voiceId = pickOfficialSpeechVoice({
        activeSpeechProvider: provider,
        activeSpeechVoiceId: '',
        availableVoices: { [provider]: voices },
        uiLocale: locale.value,
      }) ?? ''
    }
    return { provider, model, voice_id: voiceId }
  }

  /** Applies committed character fields in the leader before catalog watchers run. */
  async function selectProviderModel(provider: string, model: string, voiceId?: string) {
    if (disposed)
      return
    const changed = activeSpeechProvider.value !== provider || activeSpeechModel.value !== model
    activeSpeechProvider.value = provider
    activeSpeechModel.value = model
    if (changed)
      clearVoiceSelection()
    // Discard the previous model before applying an explicit card voice. The
    // loader must not treat that new choice as a selection from the old catalog.
    if (voiceCatalogIdentities.value[provider]?.model !== (activeSpeechModel.value || undefined))
      discardVoiceCatalog(provider)
    if (voiceId !== undefined)
      activeSpeechVoiceId.value = voiceId
    // Watchers run after this synchronous state commit. They route discovery
    // through the exposed action without publishing a follower snapshot.
    return { provider: activeSpeechProvider.value, model: activeSpeechModel.value }
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
    try {
      await useSpeechStore(pinia).loadVoicesForProvider(newProvider, newModel || undefined)
    }
    catch (error) {
      if (!disposed && !stale)
        console.error('Failed to load speech voices:', errorMessageFrom(error))
    }
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

  /** Projects the committed voice into its catalog metadata without selecting a recommendation. */
  async function ensureActiveSpeechVoice() {
    if (disposed)
      return
    // A selection watcher can run before the ownership watcher reaches its RPC.
    // Reject expired recommendations at their consumer as well as on notification.
    discardExpiredVoiceCatalogs()
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

  /** Captures one response's provider, voice, model, and settings before any asynchronous work. */
  function createOutput(turn: TurnRef, selection: AiriExtension['modules']['speech'], output: Pick<SpeechOutput, 'playback' | 'onPlaybackStart' | 'onPlaybackEnd' | 'onSpecial'>, audioContext: AudioContext): SpeechOutput {
    const providerId = selection.provider
    const config = structuredClone(toRaw(providerStore.getProviderConfig(providerId) ?? {}))
    const selectedVoice = availableVoices.value[providerId]?.find(voice => voice.id === selection.voice_id)
    const voice = selectedVoice ? structuredClone(toRaw(selectedVoice)) : undefined
    const effective = resolveSpeechOutputSelection(selection, config, providersStore.getDefaultModelForProvider(providerId))
    const model = effective.model
    const voiceId = effective.voice_id
    const useSSML = ssmlEnabled.value
    const canUseSSML = ['elevenlabs', 'microsoft-speech', 'azure-speech'].includes(providerId) || (providerId === 'alibaba-cloud-model-studio' && model === 'cosyvoice-v2')
    const pitchValue = pitch.value
    const voiceType = providerId === OFFICIAL_SPEECH_PROVIDER_ID || providerId === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
      ? 'official_selected' as const
      : 'custom_configured' as const
    if (getSpeechSelectionState(effective) !== 'ready')
      return { ...output, synthesize: async () => null }
    if (getDefinedProvider(providerId)?.capabilities?.speech?.transport === 'bidirectional-ws') {
      const streamingModel = model
      const resource = streamingModel.split('/', 2)[1]
      return { ...output, stream: async (text, signal) => streamSpeech({
        audioContext,
        model: streamingModel,
        voice: voiceId,
        turnId: turn.turnId,
        ttsVoiceType: voiceType,
        bufferEntireSession: resource.startsWith('seed-tts-2.0') || resource.startsWith('seed-icl-2.0'),
        extraBody: { api_resource_id: resource, audio: { sample_rate: 24000, bit_rate: 64000 } },
      }, text, signal) }
    }
    const provider = providersStore.getProviderInstance<SpeechProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
    return { ...output, synthesize: async (request, signal) => {
      signal.throwIfAborted()
      const client = await provider
      signal.throwIfAborted()
      const input = voice && useSSML && canUseSSML ? generateSSML(request.text, voice, { ...config, pitch: pitchValue }) : request.text
      const settings = providerId === OFFICIAL_SPEECH_PROVIDER_ID
        ? { ...config, extraBody: { ...(config.extraBody as Record<string, unknown> | undefined), airi_analytics: { trigger: 'auto', source: 'chat_auto_tts', voice_type: voiceType, turn_id: turn.turnId } } }
        : config
      const audio = await generateSpeech({ ...client.speech(model, settings), input, voice: voiceId, abortSignal: signal })
      return new Blob([audio])
    } }
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

  /** Releases this caller's waits, then awaits the leader's shared reset. Transport failures propagate to the caller. */
  async function resetState() {
    cancelCatalogRequests()
    await useSpeechStore(pinia).resetSettings()
  }

  /** Resets shared settings in the leader and rejects catalog results started before this reset. */
  async function resetSettings() {
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
    catalog.$patch((state) => {
      state.availableVoices = {}
      state.voiceCatalogIdentities = {}
      state.resetGeneration++
    })
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
    availableVoices: computed(() => availableVoices.value),
    voiceCatalogIdentities: computed(() => voiceCatalogIdentities.value),
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
    invalidateVoiceCatalogs,
    selectProviderModel,
    ensureActiveSpeechVoice,
    getVoicesForProvider,
    resolveSelection,
    generateSSML,
    resolveSpeechInput,
    createOutput,
    resetState,
    resetSettings,
  }
}, {
  synced: {
    actions: ['loadVoiceCatalog', 'invalidateVoiceCatalogs', 'selectProviderModel', 'ensureActiveSpeechVoice', 'resetSettings'],
    state: true,
  },
})
