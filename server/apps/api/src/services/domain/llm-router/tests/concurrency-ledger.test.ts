import type Redis from 'ioredis'

import { beforeEach, describe, expect, it } from 'vitest'

import { createConcurrencyLedger } from '../concurrency-ledger'

// NOTICE: Mimic the subset of Redis semantics the ledger uses (EVAL for the
// ACQUIRE/RELEASE Lua, plus SET/EXISTS/GET/SADD/SMEMBERS/MGET). The two Lua
// scripts are told apart by numKeys (acquire passes 2 keys, release passes 1) —
// same approach flux-meter.test.ts uses for its single script. Real Lua
// atomicity is exercised by ioredis hitting Redis in integration; here we verify
// the capacity decision, floor-guarded release, saturation flags, and snapshot.
function createMockRedis() {
  const inflight = new Map<string, number>()
  const saturated = new Set<string>()
  const known = new Set<string>()

  const evalImpl = async (_script: string, numKeys: number, ...args: Array<string | number>) => {
    if (numKeys === 2) {
      // ACQUIRE_SCRIPT: inflightKey, knownKey, max, ttl, poolId
      const inflightKey = String(args[0])
      const knownKey = String(args[1])
      const max = Number(args[2])
      const poolId = String(args[4])
      const current = inflight.get(inflightKey) ?? 0
      if (current < max) {
        const next = current + 1
        inflight.set(inflightKey, next)
        known.add(`${knownKey}::${poolId}`)
        return next
      }
      return -1
    }
    // RELEASE_SCRIPT: inflightKey
    const inflightKey = String(args[0])
    const current = inflight.get(inflightKey) ?? 0
    if (current > 0) {
      const next = current - 1
      inflight.set(inflightKey, next)
      return next
    }
    return 0
  }

  const redis = {
    eval: evalImpl,
    set: async (key: string, _val: string, _mode: string, _ttl: number) => {
      saturated.add(key)
      return 'OK'
    },
    exists: async (key: string) => (saturated.has(key) ? 1 : 0),
    get: async (key: string) => {
      const v = inflight.get(key)
      return v == null ? null : String(v)
    },
    smembers: async (key: string) => {
      const prefix = `${key}::`
      return [...known].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
    },
    mget: async (keys: string[]) => keys.map(k => (inflight.has(k) ? String(inflight.get(k)) : null)),
  } as unknown as Redis

  return { redis, inflight, saturated }
}

describe('concurrencyLedger', () => {
  let mock: ReturnType<typeof createMockRedis>
  let ledger: ReturnType<typeof createConcurrencyLedger>

  beforeEach(() => {
    mock = createMockRedis()
    ledger = createConcurrencyLedger(mock.redis)
  })

  it('tryAcquire grants a slot while the pool is below max and increments inflight', async () => {
    // @example acquire on an empty pool (cap 10) -> granted, inflight becomes 1
    const granted = await ledger.tryAcquire('app-1', 10)
    expect(granted).toBe(true)
    expect(await ledger.currentInflight('app-1')).toBe(1)
  })

  it('tryAcquire rejects once the pool is at max without incrementing past the cap', async () => {
    // @example cap 2 -> first two granted, third rejected, inflight stays 2
    expect(await ledger.tryAcquire('app-1', 2)).toBe(true)
    expect(await ledger.tryAcquire('app-1', 2)).toBe(true)
    expect(await ledger.tryAcquire('app-1', 2)).toBe(false)
    expect(await ledger.currentInflight('app-1')).toBe(2)
  })

  it('grants no more than max across many acquires on one pool (capacity invariant)', async () => {
    // @example cap 10, attempt 15 acquires -> exactly 10 granted
    const results = await Promise.all(
      Array.from({ length: 15 }, () => ledger.tryAcquire('app-1', 10)),
    )
    expect(results.filter(Boolean)).toHaveLength(10)
    expect(await ledger.currentInflight('app-1')).toBe(10)
  })

  it('release returns a slot so a previously-full pool can grant again', async () => {
    // @example cap 1: acquire, reject second, release, then acquire succeeds
    expect(await ledger.tryAcquire('app-1', 1)).toBe(true)
    expect(await ledger.tryAcquire('app-1', 1)).toBe(false)
    await ledger.release('app-1')
    expect(await ledger.currentInflight('app-1')).toBe(0)
    expect(await ledger.tryAcquire('app-1', 1)).toBe(true)
  })

  it('release floors at zero and never drives the counter negative', async () => {
    // @example releasing an idle pool keeps inflight at 0 (no negative overshoot)
    await ledger.release('app-1')
    expect(await ledger.currentInflight('app-1')).toBe(0)
  })

  it('isSaturated reflects markSaturated', async () => {
    // @example before mark -> false; after mark -> true
    expect(await ledger.isSaturated('app-1')).toBe(false)
    await ledger.markSaturated('app-1', 5)
    expect(await ledger.isSaturated('app-1')).toBe(true)
  })

  it('snapshot lists every acquired pool with its current inflight count', async () => {
    // @example acquire on two pools -> snapshot reports both with counts
    await ledger.tryAcquire('app-1', 10)
    await ledger.tryAcquire('app-1', 10)
    await ledger.tryAcquire('app-2', 10)
    const snap = await ledger.snapshot()
    expect(snap).toContainEqual({ poolId: 'app-1', inflight: 2 })
    expect(snap).toContainEqual({ poolId: 'app-2', inflight: 1 })
  })

  it('snapshot is empty before any pool is acquired', async () => {
    // @example fresh ledger -> snapshot returns []
    expect(await ledger.snapshot()).toEqual([])
  })
})
