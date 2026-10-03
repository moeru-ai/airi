import { describe, expect, it, vi } from 'vitest'

import { createTestRedis } from '../tests/redis'
import { readCache, writeCache } from './cache'

describe('redis cache functions', () => {
  it('writes an expiring snapshot atomically and replaces an existing persistent value', async () => {
    const redis = createTestRedis()
    await redis.set('test:snapshot', 'old')
    const set = vi.spyOn(redis, 'set')

    await writeCache(redis, 'test:snapshot', 'new', { ttlSeconds: 20 })

    expect(set).toHaveBeenCalledWith('test:snapshot', 'new', 'EX', 20)
    expect(await readCache(redis, 'test:snapshot')).toBe('new')
    expect(await redis.ttl('test:snapshot')).toBeGreaterThan(0)
    expect(await redis.ttl('test:snapshot')).toBeLessThanOrEqual(20)
  })

  it('treats missing and persistent entries as cache misses', async () => {
    const redis = createTestRedis()
    expect(await readCache(redis, 'test:snapshot')).toBeNull()
    await redis.set('test:snapshot', 'persistent')
    expect(await readCache(redis, 'test:snapshot')).toBeNull()
  })

  it('rejects invalid TTLs before writing to Redis', async () => {
    const redis = createTestRedis()
    const set = vi.spyOn(redis, 'set')
    for (const ttlSeconds of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(writeCache(redis, 'test:snapshot', 'value', { ttlSeconds })).rejects.toThrow()
    }
    expect(set).not.toHaveBeenCalled()
  })

  it('propagates Redis errors so callers retain their failure policy', async () => {
    const redis = createTestRedis()
    vi.spyOn(redis, 'eval').mockRejectedValueOnce(new Error('read unavailable'))
    vi.spyOn(redis, 'set').mockRejectedValueOnce(new Error('write unavailable'))

    await expect(readCache(redis, 'test:snapshot')).rejects.toThrow('read unavailable')
    await expect(writeCache(redis, 'test:snapshot', 'value', { ttlSeconds: 20 })).rejects.toThrow('write unavailable')
  })
})
