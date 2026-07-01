import { nextTick } from 'vue'

import { initializeAuth } from '../libs/auth'
import { getStreamingTtsAvailable, OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../libs/providers'
import { useAuthStore } from '../stores/auth'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useVisionStore } from '../stores/modules/vision'
import { useProvidersStore } from '../stores/providers'
import { useAnalytics } from './use-analytics'

/**
 * Provider IDs to auto-activate on sign-in.
 * Edit this list to enable/disable official providers.
 */
const AUTH_ACTIVATED_PROVIDERS: Array<{ id: string, module: 'consciousness' | 'speech' | 'hearing' | 'vision' }> = [
  { id: 'official-provider', module: 'consciousness' },
  { id: 'vision-official-provider', module: 'vision' },
  { id: 'official-provider-speech', module: 'speech' },
  { id: OFFICIAL_TRANSCRIPTION_PROVIDER_ID, module: 'hearing' },
]

// The streaming TTS provider is NOT in the static list above because its
// visibility is operator-controlled: `UNSPEECH_UPSTREAM.streaming` may be
// unconfigured server-side. It's bootstrapped separately (see
// `syncStreamingSpeechProvider`) — probed on sign-in, then force-configured
// only when the server reports it available, mirroring how the HTTP TTS
// provider uses `forceProviderConfigured` but gating it on a server signal.
const STREAMING_SPEECH_PROVIDER_ID = 'official-provider-speech-streaming'

/**
 * Glue layer: uses auth lifecycle hooks to activate/deactivate
 * official providers. Providers themselves know nothing about auth.
 */
export function useAuthProviderSync() {
  initializeAuth()

  const authStore = useAuthStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const visionStore = useVisionStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const { trackOfficialProviderSelected } = useAnalytics()

  // Track whether the sync has already fired in this session to avoid
  // re-running on every page navigation (onAuthenticated fires immediately
  // if already signed in when the hook is registered).
  let hasSynced = false

  authStore.onAuthenticated(async () => {
    if (hasSynced)
      return
    hasSynced = true

    const toActivate = AUTH_ACTIVATED_PROVIDERS.filter(
      p => providersStore.getProviderMetadata(p.id) != null,
    )

    for (const { id } of toActivate) {
      providersStore.forceProviderConfigured(id)
    }

    // Only set official provider as active when the user hasn't configured
    // any provider for that module yet.
    for (const { id, module } of toActivate) {
      switch (module) {
        case 'consciousness':
          if (!consciousnessStore.activeProvider) {
            consciousnessStore.activeProvider = id
            consciousnessStore.activeModel = 'auto'
            trackOfficialProviderSelected({
              provider_id: id,
              provider_mode: 'official',
              source: 'default_auto',
              auto_selected: true,
              model_id: 'auto',
            })
          }
          break
        case 'vision':
          if (!visionStore.activeProvider) {
            visionStore.activeProvider = id
            visionStore.activeModel = 'auto'
          }
          break
        case 'speech':
          if (!speechStore.activeSpeechProvider || speechStore.activeSpeechProvider === 'speech-noop') {
            speechStore.activeSpeechProvider = id
            speechStore.activeSpeechModel = ''
          }
          break
        case 'hearing':
          if (!hearingStore.activeTranscriptionProvider) {
            hearingStore.activeTranscriptionProvider = id
            hearingStore.activeTranscriptionModel = 'auto'
          }
          break
      }
    }

    await nextTick()
    try {
      await Promise.all(
        toActivate.map(({ id, module }) =>
          module === 'consciousness'
            ? consciousnessStore.loadModelsForProvider(id)
            : module === 'vision'
              ? visionStore.loadModelsForProvider(id)
              : providersStore.fetchModelsForProvider(id),
        ),
      )
    }
    catch (err) {
      console.error('error loading models for official providers', err)
    }

    await syncStreamingSpeechProvider()
  })

  // Bootstrap the streaming TTS provider from the server's availability signal.
  // Probing populates `getStreamingTtsAvailable()` (and the default model /
  // voices) via the provider's listModels(). The availability override drives
  // the provider's presence in the available/configured lists (and thus the
  // settings card + picker); force-configure makes it selectable. It is never
  // set as the active speech provider — the HTTP TTS provider stays default.
  async function syncStreamingSpeechProvider() {
    if (providersStore.getProviderMetadata(STREAMING_SPEECH_PROVIDER_ID) == null)
      return

    await providersStore.fetchModelsForProvider(STREAMING_SPEECH_PROVIDER_ID)

    const available = getStreamingTtsAvailable()
    providersStore.setProviderAvailabilityOverride(STREAMING_SPEECH_PROVIDER_ID, available)

    if (available) {
      providersStore.forceProviderConfigured(STREAMING_SPEECH_PROVIDER_ID)
      // The speech-module watcher skips voice loading for streaming until it's
      // confirmed configured (avoids a pre-probe request on reload), so when
      // streaming is the persisted active provider, load its voices now that
      // it's confirmed available.
      if (speechStore.activeSpeechProvider === STREAMING_SPEECH_PROVIDER_ID) {
        speechStore.ensureStreamingDefaultModel()
        await speechStore.loadVoicesForProvider(STREAMING_SPEECH_PROVIDER_ID, speechStore.activeSpeechModel || undefined)
      }
      return
    }

    providersStore.setProviderUnconfigured(STREAMING_SPEECH_PROVIDER_ID)
    // `setProviderUnconfigured` blanks `validatedCredentialHash`, which makes
    // the speech-module reset watcher skip its own clear. So when the server
    // now reports streaming unavailable on an authenticated reload (no logout
    // event fires), clear a stale active streaming selection here.
    clearActiveStreamingSelection()
  }

  function clearActiveStreamingSelection() {
    if (speechStore.activeSpeechProvider !== STREAMING_SPEECH_PROVIDER_ID)
      return
    speechStore.activeSpeechProvider = ''
    speechStore.activeSpeechModel = ''
    speechStore.activeSpeechVoiceId = ''
  }

  authStore.onLogout(() => {
    hasSynced = false

    for (const { id } of AUTH_ACTIVATED_PROVIDERS) {
      providersStore.setProviderUnconfigured(id)
    }

    // Streaming TTS is bootstrapped outside AUTH_ACTIVATED_PROVIDERS, so reset
    // it explicitly. `setProviderUnconfigured` blanks `validatedCredentialHash`,
    // which makes the speech-module watcher skip its own reset (it guards
    // against racing initial validation), so clear the active selection here
    // too when streaming was the active provider.
    clearActiveStreamingSelection()
    providersStore.setProviderUnconfigured(STREAMING_SPEECH_PROVIDER_ID)
    providersStore.setProviderAvailabilityOverride(STREAMING_SPEECH_PROVIDER_ID, false)

    // Reset active provider/model if they belong to an auth-activated provider
    for (const { id, module } of AUTH_ACTIVATED_PROVIDERS) {
      switch (module) {
        case 'consciousness':
          if (consciousnessStore.activeProvider === id) {
            consciousnessStore.activeProvider = ''
            consciousnessStore.activeModel = ''
          }
          break
        case 'vision':
          if (visionStore.activeProvider === id) {
            visionStore.activeProvider = ''
            visionStore.activeModel = ''
          }
          break
        case 'speech':
          if (speechStore.activeSpeechProvider === id) {
            speechStore.activeSpeechProvider = ''
            speechStore.activeSpeechModel = ''
          }
          break
        case 'hearing':
          if (hearingStore.activeTranscriptionProvider === id) {
            hearingStore.activeTranscriptionProvider = ''
            hearingStore.activeTranscriptionModel = ''
          }
          break
      }
    }
  })
}
