import { afterEach, expect, it, vi } from 'vitest'

import { AIRI_CHAT_SESSION_ID_HEADER } from '../../../product-signals/headers'
import { withCredentials } from './shared'

vi.mock('pinia', async importOriginal => ({ ...await importOriginal<typeof import('pinia')>(), getActivePinia: () => ({}) }))
vi.mock('../../../../libs/auth', () => ({ getAuthToken: () => 'token' }))
vi.mock('../../../../stores/chat/session-store', () => ({ useChatSessionStore: () => ({ activeSessionId: 'open-session' }) }))

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'))
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockClear()
})

function sentHeaders() {
  return new Headers(fetchMock.mock.calls[0]![1]!.headers)
}

it('keeps the session ID that a background turn sends', async () => {
  await withCredentials()('https://api.example/chat', { headers: { [AIRI_CHAT_SESSION_ID_HEADER]: 'background-session' } })
  expect(sentHeaders().get(AIRI_CHAT_SESSION_ID_HEADER)).toBe('background-session')
  expect(sentHeaders().get('Authorization')).toBe('Bearer token')
})

it('uses the open session for a request that names none', async () => {
  await withCredentials()('https://api.example/audio/speech', {})
  expect(sentHeaders().get(AIRI_CHAT_SESSION_ID_HEADER)).toBe('open-session')
})
