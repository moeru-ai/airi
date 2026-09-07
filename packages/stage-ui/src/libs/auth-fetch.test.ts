import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../stores/auth'
import { authedFetch } from './auth-fetch'

const posthogMocks = vi.hoisted(() => ({
  getAnalyticsIdentitySnapshot: vi.fn<() => { distinctId: string, sessionId: string } | null>(() => ({
    distinctId: 'distinct-1',
    sessionId: 'session-1',
  })),
}))

vi.mock('./product-signals', () => ({
  getAnalyticsIdentitySnapshot: posthogMocks.getAnalyticsIdentitySnapshot,
}))

describe('authedFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    useAuthStore().token = 'access-token'
    posthogMocks.getAnalyticsIdentitySnapshot.mockReturnValue({
      distinctId: 'distinct-1',
      sessionId: 'session-1',
    })
  })

  it('sends PostHog identity headers with authenticated API requests', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await authedFetch('https://api.airi.build/api/v1/stripe/checkout', {
      method: 'POST',
    })

    const headers = fetchMock.mock.calls[0]?.[1]?.headers
    expect(headers).toBeInstanceOf(Headers)
    expect((headers as Headers).get('Authorization')).toBe('Bearer access-token')
    expect((headers as Headers).get('x-posthog-distinct-id')).toBe('distinct-1')
    expect((headers as Headers).get('x-posthog-session-id')).toBe('session-1')
  })

  it('omits PostHog identity headers when analytics has no active identity', async () => {
    posthogMocks.getAnalyticsIdentitySnapshot.mockReturnValue(null)
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await authedFetch('https://api.example.test/api/v1/stripe/checkout')

    const headers = fetchMock.mock.calls[0]?.[1]?.headers
    expect(headers).toBeInstanceOf(Headers)
    expect((headers as Headers).get('Authorization')).toBe('Bearer access-token')
    expect((headers as Headers).get('x-posthog-distinct-id')).toBeNull()
    expect((headers as Headers).get('x-posthog-session-id')).toBeNull()
  })

  it('does not send PostHog identity headers to non-server origins', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await authedFetch('https://third-party.example.test/resource')

    const headers = fetchMock.mock.calls[0]?.[1]?.headers
    expect(headers).toBeInstanceOf(Headers)
    expect((headers as Headers).get('Authorization')).toBe('Bearer access-token')
    expect((headers as Headers).get('x-posthog-distinct-id')).toBeNull()
    expect((headers as Headers).get('x-posthog-session-id')).toBeNull()
  })
})
