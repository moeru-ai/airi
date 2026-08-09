import { describe, expect, it } from 'vitest'

import {
  resolveHealthCheckIntervalMs,
  serverWsDefaultHeartbeatTtlMs,
  serverWsMinimumHealthCheckIntervalMs,
} from './liveness'

describe('airi websocket liveness policy', () => {
  it('uses the AIRI default heartbeat TTL', () => {
    expect(serverWsDefaultHeartbeatTtlMs).toBe(60_000)
    expect(resolveHealthCheckIntervalMs(serverWsDefaultHeartbeatTtlMs)).toBe(12_000)
  })

  it('keeps health checks at least five seconds apart', () => {
    expect(serverWsMinimumHealthCheckIntervalMs).toBe(5_000)
    expect(resolveHealthCheckIntervalMs(1_000)).toBe(serverWsMinimumHealthCheckIntervalMs)
    expect(resolveHealthCheckIntervalMs(24_999)).toBe(serverWsMinimumHealthCheckIntervalMs)
    expect(resolveHealthCheckIntervalMs(25_000)).toBe(serverWsMinimumHealthCheckIntervalMs)
  })
})
