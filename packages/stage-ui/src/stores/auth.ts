import type { Session, User } from 'better-auth'

import { StorageSerializers, useLocalStorage, whenever } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { client } from '../composables/api'
import { useBreakpoints } from '../composables/use-breakpoints'

/**
 * Auth store — holds identity state and credits.
 *
 * This store has no dependency on `stores/providers`, which allows
 * `providers` to safely depend on it without creating a circular import.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = useLocalStorage<User | null>('auth/v1/user', null, {
    // Why: https://github.com/vueuse/vueuse/pull/614#issuecomment-875450160
    serializer: StorageSerializers.object,
  })
  const session = useLocalStorage<Session | null>('auth/v1/session', null, { serializer: StorageSerializers.object })
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => user.value?.id ?? 'local')

  const credits = useLocalStorage<number>('user/v1/flux', 0)

  // For controlling the login drawer on mobile
  const needsLogin = ref(false)
  const { isMobile } = useBreakpoints()

  whenever(needsLogin, () => {
    if (isMobile.value) {
      return
    }

    // TODO: type safe, import `useRouter` from router.ts
    window.location.href = '/auth/login'
  })

  // Reset status when changing the window viewport
  watch(isMobile, () => needsLogin.value = false)

  // --- Lifecycle hooks ---
  type AuthHook = () => void | Promise<void>
  const authenticatedHooks: AuthHook[] = []
  const logoutHooks: AuthHook[] = []

  function onAuthenticated(hook: AuthHook) {
    authenticatedHooks.push(hook)
    // If already authenticated when hook is registered, fire immediately.
    // This covers the case where auth resolves before the hook is registered.
    if (isAuthenticated.value) {
      hook()
    }
    return () => {
      const idx = authenticatedHooks.indexOf(hook)
      if (idx >= 0)
        authenticatedHooks.splice(idx, 1)
    }
  }

  function onLogout(hook: AuthHook) {
    logoutHooks.push(hook)
    return () => {
      const idx = logoutHooks.indexOf(hook)
      if (idx >= 0)
        logoutHooks.splice(idx, 1)
    }
  }

  // Dispatch hooks when auth state changes
  watch(isAuthenticated, async (val, oldVal) => {
    if (val && !oldVal) {
      for (const hook of authenticatedHooks) {
        try { await hook() }
        catch (e) { console.error('auth hook error', e) }
      }
    }
    if (!val && oldVal) {
      for (const hook of logoutHooks) {
        try { await hook() }
        catch (e) { console.error('logout hook error', e) }
      }
    }
  })

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

      needsLogin.value = false
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
    needsLogin,
    onAuthenticated,
    onLogout,
  }
})
