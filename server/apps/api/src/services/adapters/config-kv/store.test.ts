import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { createTestRedis } from '../../../libs/tests/redis'
import { configKV } from '../../../schemas'
import { createConfigKVStore } from './store'

describe('configKV store', () => {
  let db: Awaited<ReturnType<typeof mockDB>>

  beforeEach(async () => {
    db = await mockDB({ configKV })
  })

  it('returns a Redis cache hit without reading PostgreSQL', async () => {
    const redis = createTestRedis()
    await redis.set('cache:config:FLUX_PER_REQUEST', '7')
    const set = vi.spyOn(redis, 'set')
    const store = createConfigKVStore(db, redis)

    await expect(store.getRaw('FLUX_PER_REQUEST')).resolves.toBe('7')
    expect(set).not.toHaveBeenCalled()
  })

  it('falls back to PostgreSQL and fills Redis for 300 seconds', async () => {
    await db.insert(configKV).values({ key: 'FLUX_PER_REQUEST', value: '8' })
    const redis = createTestRedis()
    const set = vi.spyOn(redis, 'set')
    const store = createConfigKVStore(db, redis)

    await expect(store.getRaw('FLUX_PER_REQUEST')).resolves.toBe('8')
    expect(set).toHaveBeenCalledWith('cache:config:FLUX_PER_REQUEST', '8', 'EX', 300)
  })

  it('fails when Redis reads fail', async () => {
    await db.insert(configKV).values({ key: 'FLUX_PER_REQUEST', value: '9' })
    const redis = createTestRedis()
    vi.spyOn(redis, 'get').mockRejectedValueOnce(new Error('redis offline'))
    const store = createConfigKVStore(db, redis)

    await expect(store.getRaw('FLUX_PER_REQUEST')).rejects.toThrow('redis offline')
  })

  it('returns null when PostgreSQL has no row', async () => {
    const redis = createTestRedis()
    const set = vi.spyOn(redis, 'set')
    const store = createConfigKVStore(db, redis)

    await expect(store.getRaw('DEFAULT_CHAT_MODEL')).resolves.toBeNull()
    expect(set).not.toHaveBeenCalled()
  })

  it('fails when Redis cannot store a PostgreSQL value', async () => {
    await db.insert(configKV).values({ key: 'FLUX_PER_REQUEST', value: '9' })
    const redis = createTestRedis()
    vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('redis offline'))
    const store = createConfigKVStore(db, redis)

    await expect(store.getRaw('FLUX_PER_REQUEST')).rejects.toThrow('redis offline')
  })

  it('deletes the derived cache entry during invalidation', async () => {
    const redis = createTestRedis()
    await redis.set('cache:config:LLM_ROUTER_CONFIG', '{}')
    const del = vi.spyOn(redis, 'del')
    const store = createConfigKVStore(db, redis)

    await store.invalidateCache('LLM_ROUTER_CONFIG')

    expect(del).toHaveBeenCalledWith('cache:config:LLM_ROUTER_CONFIG')
    await expect(redis.get('cache:config:LLM_ROUTER_CONFIG')).resolves.toBeNull()
  })

  it('fails invalidation when Redis cannot delete the derived value', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'del').mockRejectedValueOnce(new Error('redis offline'))
    const store = createConfigKVStore(db, redis)

    await expect(store.invalidateCache('LLM_ROUTER_CONFIG')).rejects.toThrow('redis offline')
  })

  it('removes a stale cache entry when a fresh database read is missing', async () => {
    const redis = createTestRedis()
    await redis.set('cache:config:FLUX_PER_REQUEST', '20')
    const del = vi.spyOn(redis, 'del')
    const store = createConfigKVStore(db, redis)

    await expect(store.getFreshRaw('FLUX_PER_REQUEST')).resolves.toBeNull()

    expect(del).toHaveBeenCalledWith('cache:config:FLUX_PER_REQUEST')
    await expect(redis.get('cache:config:FLUX_PER_REQUEST')).resolves.toBeNull()
  })
})
