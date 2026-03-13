import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'
import { SERVER_URL } from './server'

export type OAuthProvider = 'google' | 'github'

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  credentials: 'include',
})

let initialized = false

export function initializeAuth() {
  if (initialized)
    return

  fetchSession().catch(() => {})
  initialized = true
}

export async function fetchSession() {
  const { data } = await authClient.getSession()
  if (data) {
    const authStore = useAuthStore()
    authStore.user = data.user
    authStore.session = data.session
    return true
  }

  return false
}

export async function listSessions() {
  return await authClient.listSessions()
}

export async function signOut() {
  await authClient.signOut()

  const authStore = useAuthStore()
  authStore.user = null
  authStore.session = null
}

export async function signIn(provider: OAuthProvider) {
  return await authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  })
}
