import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOpenpanelAdapter } from './openpanel'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openPanel browser adapter', () => {
  it('drops disabled events and isolates account identity across logout', async () => {
    const requests: RequestInit[] = []
    const destinations: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      destinations.push(String(input))
      if (init)
        requests.push(init)
      return new Response(JSON.stringify({ deviceId: 'server-device', sessionId: 'session-1' }), { status: 200 })
    })
    const adapter = createOpenpanelAdapter({ enabled: false })
    expect(adapter.capture('disabled_event', {})).toBe(false)
    expect(adapter.getIdentitySnapshot()).toBeNull()
    expect(adapter.setCaptureEnabled(true)).toBe(true)
    const firstDevice = adapter.getIdentitySnapshot()?.distinctId
    expect(firstDevice).toBeTruthy()
    adapter.identify('alice')
    adapter.capture('checkout_started', {}, { beforeNavigation: true })
    await vi.waitFor(() => expect(requests.some(request => String(request.body).includes('checkout_started'))).toBe(true))
    const checkout = requests.find(request => String(request.body).includes('checkout_started'))!
    expect(checkout.keepalive).toBe(true)
    expect(JSON.parse(String(checkout.body)).payload.profileId).toBe('alice')
    expect(JSON.parse(String(checkout.body)).payload.properties.__deviceId).toBe(firstDevice)

    const originalUrl = window.location.href
    history.replaceState(null, '', `${window.location.pathname}?code=private#fragment`)
    await vi.waitFor(() => expect(requests.some(request => String(request.body).includes('screen_view'))).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 80))
    adapter.capture('navigation_metadata', {})
    await vi.waitFor(() => expect(requests.some(request => String(request.body).includes('navigation_metadata'))).toBe(true))
    const navigation = requests.find(request => String(request.body).includes('navigation_metadata'))!
    expect(String(navigation.body)).not.toContain('code=private')
    expect(String(navigation.body)).not.toContain('#fragment')
    expect(JSON.parse(String(navigation.body)).payload.properties.__path).toBe(originalUrl.split(/[?#]/, 1)[0])
    expect(requests.some(request => String(request.body).includes('code=private'))).toBe(false)

    adapter.resetIdentity()
    expect(adapter.getIdentitySnapshot()?.distinctId).not.toBe(firstDevice)
    adapter.identify('bob')
    adapter.capture('new_account', {})
    await vi.waitFor(() => expect(requests.some(request => String(request.body).includes('new_account'))).toBe(true))
    const bob = requests.find(request => String(request.body).includes('new_account'))!
    expect(JSON.parse(String(bob.body)).payload.profileId).toBe('bob')
    expect(JSON.parse(String(bob.body)).payload.properties.__deviceId).not.toBe(firstDevice)

    adapter.setCaptureEnabled(false)
    history.replaceState(null, '', originalUrl)
    adapter.capture('disabled_event', {})
    adapter.setCaptureEnabled(true)
    adapter.capture('enabled_event', {})
    await vi.waitFor(() => expect(requests.some(request => String(request.body).includes('enabled_event'))).toBe(true))
    expect(requests.some(request => String(request.body).includes('disabled_event'))).toBe(false)
    expect(destinations.every(url => url.startsWith('https://analytics.airi.build/api/'))).toBe(true)
    expect(requests.every(request => !new Headers(request.headers).has('openpanel-client-secret'))).toBe(true)
    adapter.setCaptureEnabled(false)
  })
})
