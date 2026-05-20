import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { authedFetch } from '../libs/auth-fetch'
import { applyNgrokSkipRequestHeader, SERVER_URL } from '../libs/server'

async function fetchWithNgrok(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  applyNgrokSkipRequestHeader(headers)
  return authedFetch(input, { ...init, headers })
}

export const client = hc<AppType>(SERVER_URL, {
  fetch: fetchWithNgrok,
})

export type StageApiClient = typeof client
