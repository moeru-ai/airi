import type { Session, User } from 'better-auth'

import { defineStore } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

import { client } from '../composables/api'
import { fetchSession } from '../libs/auth'
import { useProvidersStore } from './providers'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  const credits = ref<number>(0)

  // For controlling the login drawer on mobile
  const isLoginDrawerOpen = ref(false)

  const initialized = ref(false)
  const initialize = () => {
    if (initialized.value)
      return

    fetchSession().catch(() => {})

    initialized.value = true
  }

  const updateCredits = async () => {
    if (!isAuthenticated.value)
      return
    const res = await client.api.flux.$get()
    if (res.ok) {
      const data = await res.json()
      credits.value = data.flux
    }
  }

  // Get providers store eagerly (it's always available since auth is a dependency of providers)
  const providersStore = useProvidersStore()

  watch(isAuthenticated, async (val) => {
    if (val) {
      updateCredits()

      // Automatically enable official providers when authenticated
      const officialProviderId = 'official-provider'
      const officialSpeechId = 'official-provider-speech'
      const officialTranscriptionId = 'official-provider-transcription'

      providersStore.forceProviderConfigured(officialProviderId)
      providersStore.forceProviderConfigured(officialSpeechId)
      providersStore.forceProviderConfigured(officialTranscriptionId)

      // Lazy-import module stores to avoid circular init:
      // auth → speech → providers → auth (providers store may not be fully set up yet)
      const { useConsciousnessStore } = await import('./modules/consciousness')
      const { useSpeechStore } = await import('./modules/speech')
      const { useHearingStore } = await import('./modules/hearing')

      const consciousnessStore = useConsciousnessStore()
      const speechStore = useSpeechStore()
      const hearingStore = useHearingStore()

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
    }
    else {
      credits.value = 0
    }
  }, { immediate: true })

  initialize()

  return {
    user,
    userId,
    session,
    isAuthenticated,
    credits,
    updateCredits,
    isLoginDrawerOpen,
  }
})
