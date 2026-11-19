import type { CaptureResult } from 'posthog-js'

import posthog from 'posthog-js'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPosthogAdapter } from './posthog'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('posthog browser adapter', () => {
  it('drops disabled events, strips URL queries, and isolates accounts across logout', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    // posthog-js drops events from bots. It reads the user agent, its brands, and
    // navigator.webdriver, and headless Chromium matches all three.
    const userAgent = navigator.userAgent.replace('HeadlessChrome', 'Chrome')
    vi.spyOn(Navigator.prototype, 'userAgent', 'get').mockReturnValue(userAgent)
    vi.spyOn(Navigator.prototype, 'webdriver', 'get').mockReturnValue(false)
    if ('userAgentData' in Navigator.prototype)
      vi.spyOn(Navigator.prototype as Navigator & { userAgentData: unknown }, 'userAgentData', 'get').mockReturnValue(undefined)
    const captured: CaptureResult[] = []
    const lastEvent = (name: string) => captured.findLast(event => event.event === name)

    const adapter = createPosthogAdapter({ enabled: false })
    posthog.on('eventCaptured', (event: CaptureResult) => captured.push(event))
    expect(adapter.capture('disabled_event', {})).toBe(false)
    expect(adapter.getIdentityHeaders()).toBeNull()

    expect(adapter.setCaptureEnabled(true)).toBe(true)
    const firstDevice = adapter.getIdentityHeaders()?.['x-posthog-distinct-id']
    expect(firstDevice).toBeTruthy()
    adapter.registerBuildInfo({ version: '1.2.3', commit: 'abc', branch: 'main', builtOn: '2026-11-09' })
    adapter.identify('alice')
    expect(adapter.capture('checkout_started', { plan: 'pro' }, { beforeNavigation: true })).toBe(true)
    expect(lastEvent('checkout_started')?.properties).toMatchObject({
      distinct_id: 'alice',
      plan: 'pro',
      app_surface: 'web',
      app_version: '1.2.3',
    })

    const originalUrl = window.location.href
    history.replaceState(null, '', `${window.location.pathname}?code=private#fragment`)
    adapter.capture('navigation_metadata', {})
    history.replaceState(null, '', originalUrl)
    const navigation = lastEvent('navigation_metadata')!
    expect(JSON.stringify(navigation)).not.toContain('code=private')
    expect(JSON.stringify(navigation)).not.toContain('#fragment')
    expect(navigation.properties.$current_url).toBe(originalUrl.split(/[?#]/, 1)[0])

    adapter.resetIdentity()
    const secondDevice = adapter.getIdentityHeaders()?.['x-posthog-distinct-id']
    expect(secondDevice).toBeTruthy()
    expect(secondDevice).not.toBe(firstDevice)
    expect(secondDevice).not.toBe('alice')
    expect(adapter.capture('new_account', {})).toBe(true)
    expect(lastEvent('new_account')?.properties).toMatchObject({ distinct_id: secondDevice, app_surface: 'web', app_version: '1.2.3' })

    expect(adapter.setCaptureEnabled(false)).toBe(false)
    expect(adapter.capture('disabled_event', {})).toBe(false)
    expect(adapter.getIdentityHeaders()).toBeNull()
    expect(adapter.setCaptureEnabled(true)).toBe(true)
    expect(adapter.getIdentityHeaders()?.['x-posthog-distinct-id']).not.toBe(secondDevice)
    expect(adapter.capture('enabled_event', {})).toBe(true)
    expect(captured.some(event => event.event === 'disabled_event')).toBe(false)
    expect(captured.some(event => event.event === '$opt_in')).toBe(false)
    expect(captured.some(event => event.event === '$autocapture')).toBe(false)
    adapter.setCaptureEnabled(false)
  })
})
