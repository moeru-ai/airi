import type { Session, User } from 'better-auth'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const authToken = useLocalStorage('auth/token', '')
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)

  watch(session, (newSession) => {
    if (newSession) {
      authToken.value = newSession.token
    }
  })

  return {
    authToken,
    user,
    session,
    isAuthenticated,
  }
})
