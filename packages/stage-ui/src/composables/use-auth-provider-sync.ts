import { nextTick, watch } from 'vue'

import { initializeAuth } from '../libs/auth'
import { useAuthStore } from '../stores/auth'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useProvidersStore } from '../stores/providers'

/**
 * Coordinates auth state with provider/module stores.
 *
 * When the user becomes authenticated, this composable automatically enables
 * the official providers and sets them as active across consciousness, speech,
 * and hearing modules.
 *
 * Call once at the app root (e.g. Stage.vue).
 */
export function useAuthProviderSync() {
  initializeAuth()

  const authState = useAuthStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()

  watch(() => authState.isAuthenticated, async (val) => {
    if (!val)
      return

    const officialProviderId = 'official-provider'
    const officialSpeechId = 'official-provider-speech'
    const officialTranscriptionId = 'official-provider-transcription'

    providersStore.forceProviderConfigured(officialProviderId)
    providersStore.forceProviderConfigured(officialSpeechId)
    providersStore.forceProviderConfigured(officialTranscriptionId)

    consciousnessStore.activeProvider = officialProviderId
    consciousnessStore.activeModel = 'auto'
    speechStore.activeSpeechProvider = officialSpeechId
    speechStore.activeSpeechModel = 'auto'
    hearingStore.activeTranscriptionProvider = officialTranscriptionId
    hearingStore.activeTranscriptionModel = 'auto'

    await nextTick()
    try {
      await Promise.all([
        consciousnessStore.loadModelsForProvider(officialProviderId),
        providersStore.fetchModelsForProvider(officialSpeechId),
        providersStore.fetchModelsForProvider(officialTranscriptionId),
      ])
    }
    catch (err) {
      console.error('error loading models for official providers', err)
    }
  }, { immediate: true })
}
