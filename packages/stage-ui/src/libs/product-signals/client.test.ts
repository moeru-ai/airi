import type { AnalyticsAdapter } from './client'

import { describe, expect, it, vi } from 'vitest'

import { AnalyticsClient } from './client'

function createAdapter(): AnalyticsAdapter {
  return {
    capture: vi.fn(() => true),
    getIdentitySnapshot: vi.fn(() => ({ distinctId: 'distinct-1', sessionId: 'session-1' })),
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

  it('degrades to a no-op when a content blocker rejects the provider adapter', async () => {
    const client = new AnalyticsClient(async () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })

    expect(client.ensureInitialized(true)).toBe(true)
    expect(client.capture('app_loaded', { platform: 'web' })).toBe(true)
    await vi.waitFor(() => {
      expect(client.capture('first_message_sent', {})).toBe(false)
    })
    expect(client.getIdentitySnapshot()).toBeNull()
  })
})
