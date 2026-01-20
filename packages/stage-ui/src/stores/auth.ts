import type { Session, User } from 'better-auth'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  const isLoginOpen = ref(false)

  // TODO: include fetchSession here for pulling and updating better-auth session with initialize(...) action

  return {
    user,
    userId,
    session,
    isAuthenticated,
    isLoginOpen,
  }
})
