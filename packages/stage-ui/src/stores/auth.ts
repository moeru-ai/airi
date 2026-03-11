import type { Session, User } from 'better-auth'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { client } from '../composables/api'

/**
 * Auth store — holds identity state and credits.
 *
 * This store has no dependency on `stores/providers`, which allows
 * `providers` to safely depend on it without creating a circular import.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  const credits = ref<number>(0)

  // For controlling the login drawer on mobile
  const isLoginDrawerOpen = ref(false)

  const updateCredits = async () => {
    if (!isAuthenticated.value)
      return
    const res = await client.api.flux.$get()
    if (res.ok) {
      const data = await res.json()
      credits.value = data.flux
    }
  }

  watch(isAuthenticated, async (val) => {
    if (val) {
      updateCredits()
    }
    else {
      credits.value = 0
    }
  }, { immediate: true })

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
