import type { Session, User } from 'better-auth'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { fetchSession } from '../libs/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)

  const isLoginOpen = ref(false)

  const initialized = ref(false)
  const initialize = () => {
    if (initialized.value)
      return

    fetchSession().catch(() => {})

    initialized.value = true
  }

  initialize()

  return {
    user,
    session,
    isAuthenticated,
    isLoginOpen,
  }
})
