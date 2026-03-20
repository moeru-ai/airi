import type { Session, User } from 'better-auth'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { fetchSession } from '../libs/auth'
import { useSettingsGeneral } from './settings'

export const useAuthStore = defineStore('auth', () => {
  const settings = useSettingsGeneral()
  const user = ref<User>()
  const session = ref<Session>()
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  // For controlling the login drawer on mobile
  const isLoginDrawerOpen = ref(false)

  const initialized = ref(false)
  const initialize = () => {
    if (initialized.value)
      return

    if (settings.remoteSyncEnabled)
      fetchSession().catch(() => {})

    initialized.value = true
  }

  watch(() => settings.remoteSyncEnabled, (enabled) => {
    if (!enabled) {
      user.value = undefined
      session.value = undefined
      return
    }

    fetchSession().catch(() => {})
  })

  initialize()

  return {
    user,
    userId,
    session,
    isAuthenticated,
    isLoginDrawerOpen,
  }
})
