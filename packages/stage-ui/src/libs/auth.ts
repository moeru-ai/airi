import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://airi-api.moeru.ai'

const authStore = useAuthStore()

export const authClient = createAuthClient({
  baseURL: SERVER_URL,

  credentials: 'include',
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => authStore.authToken,
    },
    onSuccess: (ctx) => {
      const newToken = ctx.response.headers.get('set-auth-token')
      if (newToken) {
        authStore.authToken = newToken
      }
    },
  },
})

export async function fetchSession() {
  const { data } = await authClient.getSession()
  if (data) {
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

  authStore.user = undefined
  authStore.session = undefined
  authStore.authToken = ''
}
