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

  fetchSession().catch((err) => {
    console.error('[auth] Failed to fetch session during initialization', err)
  })
  initialized = true
}

export async function fetchSession() {
  const { data, error } = await authClient.getSession()

  if (error) {
    console.error('[auth] Session fetch error', error)
    return false
  }

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
  try {
    await authClient.signOut()
  }
  catch (err) {
    console.error('[auth] Sign out error', err)
  }

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
