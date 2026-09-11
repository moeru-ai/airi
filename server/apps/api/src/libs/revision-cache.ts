import type Redis from 'ioredis'

/** Reads the revision before a database or provider request starts. Revisions do not expire, so delayed readers cannot reuse an old revision. */
export async function cacheRevision(redis: Redis, revisionKey: string): Promise<string> {
  return await redis.get(revisionKey) ?? '0'
}

/** Publishes a derived value only if no invalidation occurred during its source read. */
export async function publishCache(redis: Redis, key: string, revisionKey: string, revision: string, value: string, ttlSeconds: number): Promise<void> {
  await redis.eval(`
    if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[1] then return 0 end
    redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
    return 1
  `, 2, key, revisionKey, revision, value, ttlSeconds)
}

/** Advances the shared revision and removes the derived value atomically. Go writers use the same revision key contract. */
export async function invalidateCache(redis: Redis, key: string): Promise<void> {
  await redis.eval(`
    redis.call('INCR', KEYS[2])
    return redis.call('DEL', KEYS[1])
  `, 2, key, `${key}:revision`)
}
