import type { Database } from '../../libs/db'
import type { createConfigKVService } from '../adapters/config-kv'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createTestRedis } from '../../libs/tests/redis'
import { userFluxRedisKey } from '../../utils/redis-keys'
import { createFluxService } from './flux'

import * as schema from '../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_REQUEST: 1, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    set: vi.fn(),
  } as any
}

describe('fluxService (DB-backed)', () => {
  let db: Database
  let redis: ReturnType<typeof createTestRedis>
  let read: ReturnType<typeof vi.spyOn>
  let set: ReturnType<typeof vi.spyOn>
  let service: ReturnType<typeof createFluxService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)

    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user
  })

  beforeEach(async () => {
    redis = createTestRedis()
    read = vi.spyOn(redis, 'eval')
    set = vi.spyOn(redis, 'set')
    service = createFluxService(db, redis, createMockConfigKV())

    // Clean up flux-related tables
    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, testUser.id))
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, testUser.id))
  })

  it('getFlux should initialize new user with INITIAL_USER_FLUX and populate Redis', async () => {
    const record = await service.getFlux(testUser.id)
    expect(record.flux).toBe(100)
    expect(record).not.toHaveProperty('llmCostRemainder')
    expect(set).toHaveBeenCalledWith(userFluxRedisKey(testUser.id), '100', 'EX', 60)
  })

  it('getFlux should write a transaction entry on initialization', async () => {
    await service.getFlux(testUser.id)

    const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, testUser.id))
    expect(txRecords).toHaveLength(1)
    expect(txRecords[0]).toMatchObject({
      type: 'initial',
      amount: 100,
      balanceBefore: 0,
      balanceAfter: 100,
    })
  })

  it('getFlux should return cached value from Redis on subsequent calls', async () => {
    await service.getFlux(testUser.id)
    await service.getFlux(testUser.id)
    // Second call hits Redis cache
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('getFlux should load from DB when Redis cache misses', async () => {
    // Pre-insert user flux directly
    await db.insert(schema.userFlux).values({ userId: testUser.id, flux: 42, llmCostRemainder: 500_000 })

    const record = await service.getFlux(testUser.id)
    expect(record.flux).toBe(42)
    expect(record).not.toHaveProperty('llmCostRemainder')
    expect(set).toHaveBeenCalledWith(userFluxRedisKey(testUser.id), '42', 'EX', 60)
  })

  // ROOT CAUSE:
  //
  // Before: SET without EX retained stale balances after failed invalidation.
  // Cache hits kept returning that value indefinitely.
  // After: SET EX 60 bounds each snapshot, and reads never renew its expiry.
  // Advancing the clock verifies database reload without another initial grant.
  it('reloads the database after expiry without extending TTL on cache hits', async () => {
    await service.getFlux(testUser.id)
    await db.update(schema.userFlux).set({ flux: 42 }).where(eq(schema.userFlux.userId, testUser.id))
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 30_000)
      expect((await service.getFlux(testUser.id)).flux).toBe(100)
      expect(await redis.ttl(userFluxRedisKey(testUser.id))).toBeGreaterThan(0)
      expect(await redis.ttl(userFluxRedisKey(testUser.id))).toBeLessThanOrEqual(30)
      vi.setSystemTime(Date.now() + 31_000)
      expect((await service.getFlux(testUser.id)).flux).toBe(42)
      expect(await redis.ttl(userFluxRedisKey(testUser.id))).toBeGreaterThan(0)
    }
    finally {
      vi.useRealTimers()
    }
    expect(await db.select().from(schema.fluxTransaction)).toHaveLength(1)
  })

  it('reloads persistent cached balances from the database', async () => {
    await db.insert(schema.userFlux).values({ userId: testUser.id, flux: 42 })
    await redis.set(userFluxRedisKey(testUser.id), '999')

    expect((await service.getFlux(testUser.id)).flux).toBe(42)
    expect(await redis.ttl(userFluxRedisKey(testUser.id))).toBeGreaterThan(0)
  })

  // https://github.com/moeru-ai/airi/pull/2562
  // ROOT CAUSE:
  //
  // Before: GET could read a persistent snapshot, then PTTL could read the
  // expiry of a concurrent replacement. The old value incorrectly passed.
  // After: one Lua operation checks expiry and reads the value without
  // allowing another command between them.
  it('does not pair a persistent balance with a concurrent replacement expiry', async () => {
    await db.insert(schema.userFlux).values({ userId: testUser.id, flux: 42 })
    const key = userFluxRedisKey(testUser.id)
    await redis.set(key, '999')
    const get = redis.get.bind(redis)
    vi.spyOn(redis, 'get').mockImplementationOnce(async (requestedKey) => {
      const previous = await get(requestedKey)
      await redis.set(key, '42', 'EX', 60)
      return previous
    })

    expect((await service.getFlux(testUser.id)).flux).toBe(42)
  })

  it('reloads malformed cached balances instead of accepting partial numbers', async () => {
    await db.insert(schema.userFlux).values({ userId: testUser.id, flux: 42 })
    for (const value of ['12broken', 'NaN', '-1', '1.5', '9007199254740992']) {
      await redis.set(userFluxRedisKey(testUser.id), value, 'EX', 60)
      expect((await service.getFlux(testUser.id)).flux).toBe(42)
    }
  })

  it('propagates cache read failures', async () => {
    vi.spyOn(redis, 'eval').mockRejectedValueOnce(new Error('redis unavailable'))
    await expect(service.getFlux(testUser.id)).rejects.toThrow('redis unavailable')
  })
})
