import { ofetch } from 'ofetch'

import { useAuthStore } from '../stores/auth'
import { API_SERVER_URL } from './auth'

export function doRequest(url: string, options: RequestInit = {}) {
  const authStore = useAuthStore()
  return ofetch(url, {
    baseURL: API_SERVER_URL,
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${authStore.authToken}`,
    },
  })
}
