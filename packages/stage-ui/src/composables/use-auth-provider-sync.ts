import { nextTick } from 'vue'

import { initializeAuth } from '../libs/auth'
import { useAuthStore } from '../stores/auth'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useProvidersStore } from '../stores/providers'

/**
 * Provider IDs to auto-activate on login.
 * Edit this list to enable/disable official providers.
 */
const AUTH_ACTIVATED_PROVIDERS: Array<{ id: string, module: 'consciousness' | 'speech' | 'hearing' }> = [
  { id: 'official-provider', module: 'consciousness' },
  // { id: 'official-provider-speech', module: 'speech' },
  // { id: 'official-provider-transcription', module: 'hearing' },
]

/**
 * Glue layer: uses auth lifecycle hooks to activate/deactivate
 * official providers. Providers themselves know nothing about auth.
 */
export function useAuthProviderSync() {
  initializeAuth()

  const authStore = useAuthStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()

  // Track whether the sync has already fired in this session to avoid
  // re-running on every page navigation (onAuthenticated fires immediately
  // if already logged in when the hook is registered).
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
          }
          break
        case 'speech':
          if (!speechStore.activeSpeechProvider) {
            speechStore.activeSpeechProvider = id
            speechStore.activeSpeechModel = 'auto'
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
            : providersStore.fetchModelsForProvider(id),
        ),
      )
    }
    catch (err) {
      console.error('error loading models for official providers', err)
    }
  })

  authStore.onLogout(() => {
    hasSynced = false

    for (const { id } of AUTH_ACTIVATED_PROVIDERS) {
      providersStore.setProviderUnconfigured(id)
    }

    // Reset active provider/model if they belong to an auth-activated provider
    for (const { id, module } of AUTH_ACTIVATED_PROVIDERS) {
      switch (module) {
        case 'consciousness':
          if (consciousnessStore.activeProvider === id) {
            consciousnessStore.activeProvider = ''
            consciousnessStore.activeModel = ''
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
