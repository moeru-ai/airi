import { describe, expect, it } from 'vitest'

import { cacheRevision, invalidateCache, publishCache } from '../revision-cache'
import { createTestRedis } from './redis'

describe('cache revision protocol', () => {
  it('rejects a delayed read even when the invalidated key was absent', async () => {
    const redis = createTestRedis()
    const key = 'user:synthetic:flux'
    const revisionKey = `${key}:revision`
    const before = await cacheRevision(redis, revisionKey)
    // ROOT CAUSE: DEL on a cold cache did not prevent an old source read from publishing later.
    await invalidateCache(redis, key)
    await publishCache(redis, key, revisionKey, before, 'old', 300)
    await expect(redis.get(key)).resolves.toBeNull()
    const current = await cacheRevision(redis, revisionKey)
    await publishCache(redis, key, revisionKey, current, 'new', 300)
    await expect(redis.get(key)).resolves.toBe('new')
    await expect(redis.ttl(key)).resolves.toBeGreaterThan(290)
    await expect(redis.ttl(revisionKey)).resolves.toBe(-1)
  })
})
