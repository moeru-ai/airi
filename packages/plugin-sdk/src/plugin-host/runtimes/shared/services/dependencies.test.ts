import { afterEach, describe, expect, it, vi } from 'vitest'

import { DependencyService } from './dependencies'

describe('dependencyService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should track lifecycle transitions and preserve existing metadata when omitted', () => {
    const service = new DependencyService()

    {
      const announced = service.announce('cap:dynamic', { source: 'announce' })
      expect(announced).toMatchObject({
        key: 'cap:dynamic',
        state: 'announced',
        metadata: { source: 'announce' },
      })
      expect(service.isReady('cap:dynamic')).toBe(false)
      expect(service.list()).toEqual([
        expect.objectContaining({
          key: 'cap:dynamic',
          state: 'announced',
        }),
      ])
    }

    {
      const degraded = service.markDegraded('cap:dynamic')
      expect(degraded).toMatchObject({
        key: 'cap:dynamic',
        state: 'degraded',
        metadata: { source: 'announce' },
      })
      expect(service.isReady('cap:dynamic')).toBe(false)
      expect(service.list()).toEqual([
        expect.objectContaining({
          key: 'cap:dynamic',
          state: 'degraded',
        }),
      ])
    }

    {
      const withdrawn = service.withdraw('cap:dynamic', { reason: 'disabled' })
      expect(withdrawn).toMatchObject({
        key: 'cap:dynamic',
        state: 'withdrawn',
        metadata: { reason: 'disabled' },
      })
      expect(service.isReady('cap:dynamic')).toBe(false)
      expect(service.list()).toEqual([
        expect.objectContaining({
          key: 'cap:dynamic',
          state: 'withdrawn',
          metadata: { reason: 'disabled' },
        }),
      ])
    }

    const ready = service.markReady('cap:dynamic')
    expect(ready).toMatchObject({
      key: 'cap:dynamic',
      state: 'ready',
      metadata: { reason: 'disabled' },
    })
    expect(service.isReady('cap:dynamic')).toBe(true)
    expect(service.list()).toEqual([
      expect.objectContaining({
        key: 'cap:dynamic',
        state: 'ready',
        metadata: { reason: 'disabled' },
      }),
    ])
  })

  it('should resolve immediately when waiting for an already ready capability', async () => {
    const service = new DependencyService()
    const descriptor = service.markReady('cap:ready', { source: 'bootstrap' })

    await expect(service.waitFor('cap:ready')).resolves.toEqual(descriptor)
  })

  it('should resolve waits only when the capability reaches ready state', async () => {
    vi.useFakeTimers()

    const service = new DependencyService()
    service.markDegraded('cap:unstable', { reason: 'booting' })

    const waiting = service.waitFor('cap:unstable', 2_000)

    service.withdraw('cap:unstable', { reason: 'restarting' })
    const ready = service.markReady('cap:unstable', { source: 'recovered' })

    await vi.runAllTimersAsync()
    await expect(waiting).resolves.toEqual(ready)
  })

  it('should wait for multiple capabilities before resolving', async () => {
    const service = new DependencyService()
    const waiting = service.waitForMany(['cap:a', 'cap:b'], 2_000)
    let settled = false
    void waiting.then(() => {
      settled = true
    })

    service.markReady('cap:a', { source: 'a' })
    await Promise.resolve()
    expect(settled).toBe(false)

    service.markReady('cap:b', { source: 'b' })

    await expect(waiting).resolves.toBeUndefined()
  })
})
