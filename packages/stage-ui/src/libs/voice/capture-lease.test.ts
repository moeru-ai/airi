import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSpeechBusContext, voiceCaptureLease } from '../../services/speech/bus'
import { CAPTURE_LEASE_MS, CAPTURE_LEASE_RENEW_MS, CaptureLeases, holdCaptureLease } from './capture-lease'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('captureLeases', () => {
  it('holds from the first lease until the last one is released', () => {
    const onChange = vi.fn()
    const leases = new CaptureLeases(onChange)

    leases.update('a', Date.now() + CAPTURE_LEASE_MS)
    leases.update('b', Date.now() + CAPTURE_LEASE_MS)
    leases.update('a', 0)

    expect(leases.held).toBe(true)
    expect(onChange.mock.calls).toEqual([[true]])

    leases.update('b', 0)

    expect(leases.held).toBe(false)
    expect(onChange.mock.calls).toEqual([[true], [false]])
    leases.dispose()
  })

  it('ends a lease that nobody renews', () => {
    const onChange = vi.fn()
    const leases = new CaptureLeases(onChange)

    leases.update('a', Date.now() + CAPTURE_LEASE_MS)
    vi.advanceTimersByTime(CAPTURE_LEASE_MS - 1)
    expect(leases.held).toBe(true)

    vi.advanceTimersByTime(1)

    expect(leases.held).toBe(false)
    expect(onChange.mock.calls).toEqual([[true], [false]])
    leases.dispose()
  })

  it('keeps a renewed lease after its first end time', () => {
    const leases = new CaptureLeases(() => {})

    leases.update('a', Date.now() + CAPTURE_LEASE_MS)
    vi.advanceTimersByTime(CAPTURE_LEASE_MS - 1)
    leases.update('a', Date.now() + CAPTURE_LEASE_MS)
    vi.advanceTimersByTime(CAPTURE_LEASE_MS - 1)

    expect(leases.held).toBe(true)
    leases.dispose()
  })
})

describe('holdCaptureLease', () => {
  it('renews the lease until the signal aborts, then releases it', () => {
    const received: { id: string, until: number }[] = []
    const stop = getSpeechBusContext().on(voiceCaptureLease, ({ body }) => {
      if (body)
        received.push(body)
    })
    const controller = new AbortController()

    holdCaptureLease(controller.signal)
    vi.advanceTimersByTime(CAPTURE_LEASE_RENEW_MS * 2)
    controller.abort()
    vi.advanceTimersByTime(CAPTURE_LEASE_RENEW_MS * 2)
    stop()

    expect(received.map(lease => lease.until)).toEqual([
      Date.now() - CAPTURE_LEASE_RENEW_MS * 4 + CAPTURE_LEASE_MS,
      Date.now() - CAPTURE_LEASE_RENEW_MS * 3 + CAPTURE_LEASE_MS,
      Date.now() - CAPTURE_LEASE_RENEW_MS * 2 + CAPTURE_LEASE_MS,
      0,
    ])
    expect(new Set(received.map(lease => lease.id)).size).toBe(1)
  })
})
