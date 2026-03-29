import { createOpenAI } from '@xsai-ext/providers/create'

import { getAuthToken } from '../../../../libs/auth'
import { SERVER_URL } from '../../../../libs/server'

export const OFFICIAL_ICON = 'i-solar:star-bold-duotone'

export function withCredentials() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const token = getAuthToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return globalThis.fetch(input, {
      ...init,
      headers,
      credentials: 'omit',
    })
  }
}

export function createOfficialOpenAIProvider() {
  return createOpenAI('', `${SERVER_URL}/api/v1/openai/`)
}
