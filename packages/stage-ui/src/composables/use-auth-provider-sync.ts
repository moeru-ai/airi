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

  authStore.onAuthenticated(async () => {
    const toActivate = AUTH_ACTIVATED_PROVIDERS.filter(
      p => providersStore.getProviderMetadata(p.id) != null,
    )

    for (const { id } of toActivate) {
      providersStore.forceProviderConfigured(id)
    }

    for (const { id, module } of toActivate) {
      switch (module) {
        case 'consciousness':
          consciousnessStore.activeProvider = id
          consciousnessStore.activeModel = 'auto'
          break
        case 'speech':
          speechStore.activeSpeechProvider = id
          speechStore.activeSpeechModel = 'auto'
          break
        case 'hearing':
          hearingStore.activeTranscriptionProvider = id
          hearingStore.activeTranscriptionModel = 'auto'
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
    for (const { id } of AUTH_ACTIVATED_PROVIDERS) {
      providersStore.setProviderUnconfigured(id)
    }
  })
}
