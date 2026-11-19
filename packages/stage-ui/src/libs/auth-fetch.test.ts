import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../stores/auth'
import { authedFetch } from './auth-fetch'

const analyticsMocks = vi.hoisted(() => ({
  getAnalyticsIdentityHeaders: vi.fn<() => Record<string, string> | null>(() => null),
}))

vi.mock('./product-signals', () => ({
  getAnalyticsIdentityHeaders: analyticsMocks.getAnalyticsIdentityHeaders,
}))

describe('authedFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    useAuthStore().token = 'access-token'
    analyticsMocks.getAnalyticsIdentityHeaders.mockReturnValue({
      'x-openpanel-device-id': 'device-1',
      'x-posthog-distinct-id': 'distinct-1',
      'x-posthog-session-id': 'session-1',
    })
  })

  it('sends analytics identity headers with authenticated API requests', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await authedFetch('https://api.airi.build/api/v1/stripe/checkout', {
      method: 'POST',
    })

    const headers = fetchMock.mock.calls[0]?.[1]?.headers
    expect(headers).toBeInstanceOf(Headers)
    expect((headers as Headers).get('Authorization')).toBe('Bearer access-token')
    expect((headers as Headers).get('x-openpanel-device-id')).toBe('device-1')
    expect((headers as Headers).get('x-posthog-distinct-id')).toBe('distinct-1')
    expect((headers as Headers).get('x-posthog-session-id')).toBe('session-1')
  })

  it('omits analytics identity headers when analytics has no active identity', async () => {
    analyticsMocks.getAnalyticsIdentityHeaders.mockReturnValue(null)
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await authedFetch('https://api.example.test/api/v1/stripe/checkout')

    const headers = fetchMock.mock.calls[0]?.[1]?.headers
    expect(headers).toBeInstanceOf(Headers)
    expect((headers as Headers).get('Authorization')).toBe('Bearer access-token')
    expect((headers as Headers).get('x-openpanel-device-id')).toBeNull()
    expect((headers as Headers).get('x-posthog-distinct-id')).toBeNull()
    expect((headers as Headers).get('x-posthog-session-id')).toBeNull()
  })

  it('does not send analytics identity headers to non-server origins', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await authedFetch('https://third-party.example.test/resource')

    const headers = fetchMock.mock.calls[0]?.[1]?.headers
    expect(headers).toBeInstanceOf(Headers)
    expect((headers as Headers).get('Authorization')).toBe('Bearer access-token')
    expect((headers as Headers).get('x-openpanel-device-id')).toBeNull()
    expect((headers as Headers).get('x-posthog-distinct-id')).toBeNull()
    expect((headers as Headers).get('x-posthog-session-id')).toBeNull()
  })
})
