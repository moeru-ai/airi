import { createAuthClient } from 'better-auth/vue'

import { useAuthStore } from '../stores/auth'

export const API_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

const authStore = useAuthStore()

export const authClient = createAuthClient({
  baseURL: API_SERVER_URL,
  credentials: 'include',
  // plugins: [
  //   jwtClient(),
  // ],
  auth: {
    type: 'Bearer',
    token: () => authStore.authToken,
  },
  // fetchOptions: {
  //   onSuccess: (ctx) => {
  //     const newToken = ctx.response.headers.get('set-auth-token')
  //     if (newToken) {
  //       authStore.authToken = newToken
  //     }
  //   },
  // },
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
