import type Redis from 'ioredis'

import { createConfigKVStore } from '@proj-airi/config-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { configKV } from '../../schemas'

function createRedis() {
  const values = new Map<string, string>()
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
      return 'OK'
    }),
    del: vi.fn(async (key: string) => values.delete(key) ? 1 : 0),
  }
}

describe('shared ConfigKV store', () => {
  let db: Awaited<ReturnType<typeof mockDB>>

  beforeEach(async () => {
    db = await mockDB({ configKV })
  })

  it('returns a Redis cache hit without reading PostgreSQL', async () => {
    const redis = createRedis()
    redis.values.set('cache:config:FLUX_PER_REQUEST', '7')
    const store = createConfigKVStore(db, redis as unknown as Redis)

    await expect(store.getRaw('FLUX_PER_REQUEST')).resolves.toBe('7')
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('falls back to PostgreSQL and fills Redis for 300 seconds', async () => {
    await db.insert(configKV).values({ key: 'FLUX_PER_REQUEST', value: '8' })
    const redis = createRedis()
    const store = createConfigKVStore(db, redis as unknown as Redis)

    await expect(store.getRaw('FLUX_PER_REQUEST')).resolves.toBe('8')
    expect(redis.set).toHaveBeenCalledWith('cache:config:FLUX_PER_REQUEST', '8', 'EX', 300)
  })

  it('continues with PostgreSQL when Redis reads fail', async () => {
    await db.insert(configKV).values({ key: 'FLUX_PER_REQUEST', value: '9' })
    const redis = createRedis()
    redis.get.mockRejectedValueOnce(new Error('redis offline'))
    const onCacheError = vi.fn()
    const store = createConfigKVStore(db, redis as unknown as Redis, { onCacheError })

    await expect(store.getRaw('FLUX_PER_REQUEST')).resolves.toBe('9')
    expect(onCacheError).toHaveBeenCalledWith(expect.objectContaining({
      key: 'FLUX_PER_REQUEST',
      operation: 'read',
    }))
  })

  it('returns null when PostgreSQL has no row', async () => {
    const redis = createRedis()
    const store = createConfigKVStore(db, redis as unknown as Redis)

    await expect(store.getRaw('MISSING')).resolves.toBeNull()
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('deletes the derived cache entry during invalidation', async () => {
    const redis = createRedis()
    redis.values.set('cache:config:LLM_ROUTER_CONFIG', '{}')
    const store = createConfigKVStore(db, redis as unknown as Redis)

    await store.invalidateCache('LLM_ROUTER_CONFIG')

    expect(redis.del).toHaveBeenCalledWith('cache:config:LLM_ROUTER_CONFIG')
    expect(redis.values.has('cache:config:LLM_ROUTER_CONFIG')).toBe(false)
  })

  it('removes a stale cache entry when a fresh database read is missing', async () => {
    const redis = createRedis()
    redis.values.set('cache:config:AUTH_RATE_LIMIT_MAX', '20')
    const store = createConfigKVStore(db, redis as unknown as Redis)

    await expect(store.getFreshRaw('AUTH_RATE_LIMIT_MAX')).resolves.toBeNull()

    expect(redis.del).toHaveBeenCalledWith('cache:config:AUTH_RATE_LIMIT_MAX')
    expect(redis.values.has('cache:config:AUTH_RATE_LIMIT_MAX')).toBe(false)
  })
})
