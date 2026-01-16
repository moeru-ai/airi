import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'

export type OAuthProvider = 'google' | 'github'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://airi-api.moeru.ai'

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  credentials: 'include',
})

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
  authStore.user = undefined
  authStore.session = undefined
}

export async function signIn(provider: OAuthProvider) {
  return await authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  })
}
