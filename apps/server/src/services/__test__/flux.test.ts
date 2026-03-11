import type Redis from 'ioredis'

import type { createConfigKVService } from '../config-kv'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxService } from '../flux'

import * as schema from '../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_CENT: 1, FLUX_PER_REQUEST: 1, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    set: vi.fn(),
  } as any
}

function createMockRedis(): Redis {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK' }),
    decrby: vi.fn(async (key: string, amount: number) => {
      const current = Number.parseInt(store.get(key) ?? '0', 10)
      const next = current - amount
      store.set(key, String(next))
      return next
    }),
    incrby: vi.fn(async (key: string, amount: number) => {
      const current = Number.parseInt(store.get(key) ?? '0', 10)
      const next = current + amount
      store.set(key, String(next))
      return next
    }),
  } as unknown as Redis
}

describe('fluxService (Redis-backed)', () => {
  let db: any
  let redis: Redis
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

  beforeEach(() => {
    redis = createMockRedis()
    service = createFluxService(db, redis, createMockConfigKV())
  })

  it('getFlux should load from DB on cache miss and populate Redis', async () => {
    const record = await service.getFlux(testUser.id)
    expect(record.flux).toBe(100)
    expect(redis.set).toHaveBeenCalledWith(`flux:${testUser.id}`, '100')
  })

  it('getFlux should return cached value on subsequent calls', async () => {
    await service.getFlux(testUser.id)
    await service.getFlux(testUser.id)
    expect(redis.get).toHaveBeenCalledTimes(2)
  })

  it('consumeFlux should deduct via Redis DECRBY', async () => {
    await service.getFlux(testUser.id)
    const result = await service.consumeFlux(testUser.id, 10)
    expect(result.flux).toBe(90)
    expect(redis.decrby).toHaveBeenCalledWith(`flux:${testUser.id}`, 10)
  })

  it('consumeFlux should throw and rollback when insufficient', async () => {
    await service.getFlux(testUser.id)
    await expect(service.consumeFlux(testUser.id, 101))
      .rejects
      .toThrow('Insufficient flux')
    expect(redis.incrby).toHaveBeenCalledWith(`flux:${testUser.id}`, 101)
  })

  it('addFlux should update both DB and Redis', async () => {
    await service.getFlux(testUser.id)
    const result = await service.addFlux(testUser.id, 50)
    expect(result.flux).toBe(150)
    expect(redis.incrby).toHaveBeenCalledWith(`flux:${testUser.id}`, 50)
  })

  it('consumeFlux should lazy-load cache if not preloaded', async () => {
    const [user2] = await db.insert(schema.user).values({
      id: 'user-lazy',
      name: 'Lazy User',
      email: 'lazy@example.com',
    }).returning()
    const result = await service.consumeFlux(user2.id, 10)
    expect(result.flux).toBe(90)
  })

  it('getFlux should return updated value after consumeFlux', async () => {
    const [user] = await db.insert(schema.user).values({
      id: 'user-consume-then-get',
      name: 'Consume Then Get',
      email: 'consume-then-get@example.com',
    }).returning()
    await service.getFlux(user.id)
    await service.consumeFlux(user.id, 25)
    const record = await service.getFlux(user.id)
    expect(record.flux).toBe(75)
  })

  it('updateStripeCustomerId should update DB only', async () => {
    await service.getFlux(testUser.id)
    const result = await service.updateStripeCustomerId(testUser.id, 'cus_abc123')
    expect(result!.stripeCustomerId).toBe('cus_abc123')
  })

  it('concurrent consumeFlux should not over-deduct flux', async () => {
    const [user3] = await db.insert(schema.user).values({
      id: 'user-concurrent-consume',
      name: 'Concurrent Consumer',
      email: 'concurrent-consume@example.com',
    }).returning()
    await service.getFlux(user3.id)
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.consumeFlux(user3.id, 10)),
    )
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    const final = await service.getFlux(user3.id)
    expect(final.flux).toBeGreaterThanOrEqual(0)
    expect(final.flux).toBe(100 - fulfilled.length * 10)
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason.message).toBe('Insufficient flux')
    }
  })

  it('concurrent addFlux should accumulate correctly', async () => {
    const [user4] = await db.insert(schema.user).values({
      id: 'user-concurrent-add',
      name: 'Concurrent Adder',
      email: 'concurrent-add@example.com',
    }).returning()
    await service.getFlux(user4.id)
    await Promise.all(
      Array.from({ length: 10 }, () => service.addFlux(user4.id, 5)),
    )
    const final = await service.getFlux(user4.id)
    expect(final.flux).toBe(150)
  })
})
