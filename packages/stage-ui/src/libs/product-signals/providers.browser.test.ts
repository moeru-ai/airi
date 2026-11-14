import posthog from 'posthog-js'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadAnalyticsProviders } from './providers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadAnalyticsProviders', () => {
  it('writes each event to OpenPanel and PostHog and joins their identity headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    // posthog-js drops events from bots. Headless Chromium matches its user agent and webdriver checks.
    const userAgent = navigator.userAgent.replace('HeadlessChrome', 'Chrome')
    vi.spyOn(Navigator.prototype, 'userAgent', 'get').mockReturnValue(userAgent)
    vi.spyOn(Navigator.prototype, 'webdriver', 'get').mockReturnValue(false)
    if ('userAgentData' in Navigator.prototype)
      vi.spyOn(Navigator.prototype as Navigator & { userAgentData: unknown }, 'userAgentData', 'get').mockReturnValue(undefined)
    const posthogEvents: string[] = []

    const adapter = await loadAnalyticsProviders({ enabled: true })
    posthog.on('eventCaptured', event => posthogEvents.push(event.event))

    const headers = adapter.getIdentityHeaders()
    expect(headers?.['x-openpanel-device-id']).toBeTruthy()
    expect(headers?.['x-posthog-distinct-id']).toBeTruthy()

    expect(adapter.capture('fanout_event', { plan: 'pro' })).toBe(true)
    expect(posthogEvents).toContain('fanout_event')
    await vi.waitFor(() => {
      const openpanelBodies = fetchMock.mock.calls
        .filter(([url]) => String(url).startsWith('https://analytics.airi.build/api/'))
        .map(([, init]) => String(init?.body))
      expect(openpanelBodies.some(body => body.includes('fanout_event'))).toBe(true)
    })

    expect(adapter.setCaptureEnabled(false)).toBe(false)
    expect(adapter.getIdentityHeaders()).toBeNull()
    expect(adapter.capture('disabled_event', {})).toBe(false)
    expect(posthogEvents).not.toContain('disabled_event')
  })
})
