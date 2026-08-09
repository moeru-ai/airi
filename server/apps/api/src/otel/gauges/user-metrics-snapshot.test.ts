import type { ObservableCallback, ObservableResult } from '@opentelemetry/api'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerUserMetricsSnapshotGauges, USER_METRICS_SNAPSHOT_MAX_AGE_MS } from './user-metrics-snapshot'

afterEach(() => {
  vi.restoreAllMocks()
})

function createGaugeProbe() {
  let callback: ObservableCallback | undefined
  const observe = vi.fn()

  return {
    gauge: {
      addCallback(value: ObservableCallback) {
        callback = value
      },
    },
    observe,
    async collect() {
      if (!callback)
        throw new Error('Gauge callback was not registered')

      const result: ObservableResult = { observe }
      await callback(result)
    },
  }
}

describe('registerUserMetricsSnapshotGauges', () => {
  it('keeps periodic collection passive and only observes an explicitly recorded snapshot', async () => {
    const refreshedAt = Date.parse('2026-08-04T00:00:00.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(refreshedAt)
    const totalUsers = createGaugeProbe()
    const activeSessions = createGaugeProbe()
    const distinctActiveUsers = createGaugeProbe()

    const recorder = registerUserMetricsSnapshotGauges({
      totalUsers: totalUsers.gauge,
      activeSessions: activeSessions.gauge,
      distinctActiveUsers: distinctActiveUsers.gauge,
    })

    await Promise.all([
      totalUsers.collect(),
      activeSessions.collect(),
      distinctActiveUsers.collect(),
    ])

    expect(totalUsers.observe).not.toHaveBeenCalled()
    expect(activeSessions.observe).not.toHaveBeenCalled()
    expect(distinctActiveUsers.observe).not.toHaveBeenCalled()

    recorder.record(
      {
        totalUsers: 42,
        activeSessions: 7,
        distinctActiveUsers: 5,
      },
      refreshedAt,
    )

    await Promise.all([
      totalUsers.collect(),
      activeSessions.collect(),
      distinctActiveUsers.collect(),
    ])

    expect(totalUsers.observe).toHaveBeenLastCalledWith(42)
    expect(activeSessions.observe).toHaveBeenLastCalledWith(7)
    expect(distinctActiveUsers.observe).toHaveBeenLastCalledWith(5)
  })

  it('stops observing a snapshot after its bounded freshness interval', async () => {
    const refreshedAt = Date.parse('2026-08-04T00:00:00.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(refreshedAt)
    const totalUsers = createGaugeProbe()
    const activeSessions = createGaugeProbe()
    const distinctActiveUsers = createGaugeProbe()

    const recorder = registerUserMetricsSnapshotGauges({
      totalUsers: totalUsers.gauge,
      activeSessions: activeSessions.gauge,
      distinctActiveUsers: distinctActiveUsers.gauge,
    })

    recorder.record(
      {
        totalUsers: 42,
        activeSessions: 7,
        distinctActiveUsers: 5,
      },
      refreshedAt,
    )

    vi.mocked(Date.now).mockReturnValue(refreshedAt + USER_METRICS_SNAPSHOT_MAX_AGE_MS)
    await Promise.all([
      totalUsers.collect(),
      activeSessions.collect(),
      distinctActiveUsers.collect(),
    ])

    expect(totalUsers.observe).not.toHaveBeenCalled()
    expect(activeSessions.observe).not.toHaveBeenCalled()
    expect(distinctActiveUsers.observe).not.toHaveBeenCalled()
  })
})
