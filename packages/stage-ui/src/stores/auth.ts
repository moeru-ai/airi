import type { Session, User } from 'better-auth'

import { defineStore } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'

import { client } from '../composables/api'
import { fetchSession } from '../libs/auth'
import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  const credits = ref<number>(0)

  const isLoginOpen = ref(false)

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

  // Get store references once
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()

  watch(isAuthenticated, async (val) => {
    if (val) {
      updateCredits()

      // Automatically enable official provider when authenticated
      const officialProviderId = 'official-provider'
      providersStore.forceProviderConfigured(officialProviderId)
      consciousnessStore.activeProvider = officialProviderId
      await nextTick()
      try {
        await consciousnessStore.loadModelsForProvider(officialProviderId)
      }
      catch (err) {
        console.error('error loading models for official provider', err)
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
    isLoginOpen,
  }
})
