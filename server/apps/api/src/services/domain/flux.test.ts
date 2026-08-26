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
  const defaults: Record<string, number> = { FLUX_PER_REQUEST: 1, INITIAL_USER_FLUX: 100, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    set: vi.fn(),
  } as any
}

describe('fluxService (DB-backed)', () => {
  let db: Database
  let redis: ReturnType<typeof createTestRedis>
  let get: ReturnType<typeof vi.spyOn>
  let set: ReturnType<typeof vi.spyOn>
  let service: ReturnType<typeof createFluxService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)

    const [user] = await db.insert(schema.user).values({
      email: 'test@example.com',
      id: 'user-1',
      name: 'Test User',
    }).returning()
    testUser = user
  })

  beforeEach(async () => {
    redis = createTestRedis()
    get = vi.spyOn(redis, 'get')
    set = vi.spyOn(redis, 'set')
    service = createFluxService(db, redis, createMockConfigKV())

    // Clean up flux-related tables
    await db.delete(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, testUser.id))
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, testUser.id))
  })

  it('getFlux should initialize new user with INITIAL_USER_FLUX and populate Redis', async () => {
    const record = await service.getFlux(testUser.id)
    expect(record.flux).toBe(100)
    expect(set).toHaveBeenCalledWith(userFluxRedisKey(testUser.id), '100')
  })

  it('getFlux should write a transaction entry on initialization', async () => {
    await service.getFlux(testUser.id)

    const txRecords = await db.select().from(schema.fluxTransaction).where(eq(schema.fluxTransaction.userId, testUser.id))
    expect(txRecords).toHaveLength(1)
    expect(txRecords[0]).toMatchObject({
      amount: 100,
      balanceAfter: 100,
      balanceBefore: 0,
      type: 'initial',
    })
  })

  it('getFlux should return cached value from Redis on subsequent calls', async () => {
    await service.getFlux(testUser.id)
    await service.getFlux(testUser.id)
    // Second call hits Redis cache
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('getFlux should load from DB when Redis cache misses', async () => {
    // Pre-insert user flux directly
    await db.insert(schema.userFlux).values({ flux: 42, userId: testUser.id })

    const record = await service.getFlux(testUser.id)
    expect(record.flux).toBe(42)
    expect(set).toHaveBeenCalledWith(userFluxRedisKey(testUser.id), '42')
  })

  it('updateStripeCustomerId should update DB only', async () => {
    await db.insert(schema.userFlux).values({ flux: 100, userId: testUser.id })

    const result = await service.updateStripeCustomerId(testUser.id, 'cus_abc123')
    expect(result!.stripeCustomerId).toBe('cus_abc123')
  })
})
