import type { DatabaseMetrics } from '..'

import { describe, expect, it, vi } from 'vitest'

import { registerDbPoolGauge } from './db-pool'

function makeGauge() {
  let callback: ((result: { observe: (value: number, attributes: Record<string, string>) => void }) => void) | null = null
  const observe = vi.fn()
  const gauge = {
    addCallback: vi.fn((registeredCallback: typeof callback) => {
      callback = registeredCallback
    }),
  } as unknown as DatabaseMetrics['poolConnections']

  return {
    gauge,
    observe,
    run() {
      if (!callback)
        throw new Error('no callback registered')
      callback({ observe })
    },
  }
}

describe('registerDbPoolGauge', () => {
  it('reports the configured capacity and the live pool counts', () => {
    const pool = {
      options: { max: 20 },
      totalCount: 7,
      idleCount: 2,
      waitingCount: 3,
    }
    const { gauge, observe, run } = makeGauge()

    registerDbPoolGauge(gauge, pool)
    run()

    expect(observe).toHaveBeenCalledTimes(5)
    expect(observe).toHaveBeenCalledWith(20, { pool_state: 'max' })
    expect(observe).toHaveBeenCalledWith(7, { pool_state: 'total' })
    expect(observe).toHaveBeenCalledWith(5, { pool_state: 'used' })
    expect(observe).toHaveBeenCalledWith(2, { pool_state: 'idle' })
    expect(observe).toHaveBeenCalledWith(3, { pool_state: 'waiting' })
  })
})
