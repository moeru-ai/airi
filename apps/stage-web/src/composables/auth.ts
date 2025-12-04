import { createAuthClient } from 'better-auth/client'

export const API_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

export const authClient = createAuthClient({
  baseURL: API_SERVER_URL,
  fetchOptions: { credentials: 'include' },
})
