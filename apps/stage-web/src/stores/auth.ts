import type { Session, User } from 'better-auth'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const authToken = useLocalStorage('auth/token', '')
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  
  // TODO: include fetchSession here for pulling and updating better-auth session with initialize(...) action

  return {
    authToken,
    user,
    session,
    isAuthenticated,
  }
})
