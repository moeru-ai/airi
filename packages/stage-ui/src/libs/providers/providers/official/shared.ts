import { createOpenAI } from '@xsai-ext/providers/create'

import { SERVER_URL } from '../../../../libs/server'

export const OFFICIAL_ICON = 'i-solar:star-bold-duotone'

export function withCredentials() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    return globalThis.fetch(input, {
      ...init,
      credentials: 'include',
    })
  }
}

export function createOfficialOpenAIProvider() {
  return createOpenAI('', `${SERVER_URL}/api/v1/`)
}
