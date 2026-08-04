import type { ObservableCallback, ObservableResult } from '@opentelemetry/api'

import { describe, expect, it, vi } from 'vitest'

import { registerUserMetricsSnapshotGauges } from './user-metrics-snapshot'

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
    const totalUsers = createGaugeProbe()
    const activeSessions = createGaugeProbe()
    const distinctActiveUsers = createGaugeProbe()
    const rollingActiveUsers = createGaugeProbe()

    const recorder = registerUserMetricsSnapshotGauges({
      totalUsers: totalUsers.gauge,
      activeSessions: activeSessions.gauge,
      distinctActiveUsers: distinctActiveUsers.gauge,
      rollingActiveUsers: rollingActiveUsers.gauge,
    })

    await Promise.all([
      totalUsers.collect(),
      activeSessions.collect(),
      distinctActiveUsers.collect(),
      rollingActiveUsers.collect(),
    ])

    expect(totalUsers.observe).not.toHaveBeenCalled()
    expect(activeSessions.observe).not.toHaveBeenCalled()
    expect(distinctActiveUsers.observe).not.toHaveBeenCalled()
    expect(rollingActiveUsers.observe).not.toHaveBeenCalled()

    recorder.record({
      totalUsers: 42,
      activeSessions: 7,
      distinctActiveUsers: 5,
      rollingActiveUsers: {
        '24h': 9,
        '7d': 18,
        '30d': 30,
      },
    })

    await Promise.all([
      totalUsers.collect(),
      activeSessions.collect(),
      distinctActiveUsers.collect(),
      rollingActiveUsers.collect(),
    ])

    expect(totalUsers.observe).toHaveBeenLastCalledWith(42)
    expect(activeSessions.observe).toHaveBeenLastCalledWith(7)
    expect(distinctActiveUsers.observe).toHaveBeenLastCalledWith(5)
    expect(rollingActiveUsers.observe).toHaveBeenNthCalledWith(1, 9, { window: '24h' })
    expect(rollingActiveUsers.observe).toHaveBeenNthCalledWith(2, 18, { window: '7d' })
    expect(rollingActiveUsers.observe).toHaveBeenNthCalledWith(3, 30, { window: '30d' })
  })
})
