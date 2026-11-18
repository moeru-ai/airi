import type { AnalyticsAdapter } from './client'

import { describe, expect, it, vi } from 'vitest'

import { AnalyticsClient } from './client'

function createAdapter(): AnalyticsAdapter {
  return {
    capture: vi.fn(() => true),
    getIdentityHeaders: vi.fn(() => ({ 'x-openpanel-device-id': 'device-1' })),
    identify: vi.fn(),
    registerBuildInfo: vi.fn(),
    resetIdentity: vi.fn(),
    setCaptureEnabled: vi.fn(enabled => enabled),
  }
}

describe('analytics client', () => {
  it('queues events while a provider adapter is loading and flushes them in order', async () => {
    const adapter = createAdapter()
    let install: ((adapter: AnalyticsAdapter) => void) | undefined
    const client = new AnalyticsClient(() => new Promise<AnalyticsAdapter>((resolve) => {
      install = resolve
    }))

    expect(client.ensureInitialized(true)).toBe(true)
    expect(client.capture('app_loaded', { platform: 'web' })).toBe(true)
    client.identify('user-1')
    await Promise.resolve()
    install?.(adapter)

    await vi.waitFor(() => {
      expect(adapter.capture).toHaveBeenCalledWith('app_loaded', { platform: 'web' }, undefined)
    })
    expect(adapter.identify).toHaveBeenCalledWith('user-1')
  })

  // ROOT CAUSE:
  //
  // Analytics turned off and on in one run stayed off until restart.
  // syncCapture(true) returned early for a ready adapter and never re-enabled it.
  //
  // We fixed this by sending each capture change to the ready adapter, or to the load queue.
  it('turns a loaded adapter back on after capture was turned off', async () => {
    const adapter = createAdapter()
    const client = new AnalyticsClient(async () => adapter)

    expect(client.syncCapture(true)).toBe(true)
    await vi.waitFor(() => {
      expect(client.getIdentityHeaders()).not.toBeNull()
    })

    expect(client.syncCapture(false)).toBe(false)
    expect(client.syncCapture(true)).toBe(true)

    expect(adapter.setCaptureEnabled).toHaveBeenNthCalledWith(1, false)
    expect(adapter.setCaptureEnabled).toHaveBeenNthCalledWith(2, true)
  })

  it('turns capture back on when it was turned off and on while the adapter loads', async () => {
    const adapter = createAdapter()
    let install: ((adapter: AnalyticsAdapter) => void) | undefined
    const client = new AnalyticsClient(() => new Promise<AnalyticsAdapter>((resolve) => {
      install = resolve
    }))

    client.syncCapture(true)
    client.syncCapture(false)
    client.syncCapture(true)
    await Promise.resolve()
    install?.(adapter)

    await vi.waitFor(() => {
      expect(adapter.setCaptureEnabled).toHaveBeenLastCalledWith(true)
    })
  })

  it('degrades to a no-op when a content blocker rejects the provider adapter', async () => {
    const client = new AnalyticsClient(async () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })

    expect(client.ensureInitialized(true)).toBe(true)
    expect(client.capture('app_loaded', { platform: 'web' })).toBe(true)
    await vi.waitFor(() => {
      expect(client.capture('first_message_sent', {})).toBe(false)
    })
    expect(client.getIdentityHeaders()).toBeNull()
  })
})
