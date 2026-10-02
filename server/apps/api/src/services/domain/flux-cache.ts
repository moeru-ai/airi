import type Redis from 'ioredis'

import { minValue, number, pipe, regex, safeInteger, safeParse, string, transform } from 'valibot'

import { readCache, writeCache } from '../../libs/redis/cache'
import { userFluxRedisKey } from '../../utils/redis-keys'

/** Limits the lifetime of balance snapshots after failed invalidation or reordered writes. */
const ttlSeconds = 60
const balanceSchema = pipe(string(), regex(/^\d+$/), transform(Number), number(), safeInteger(), minValue(0))

/** Returns null for absent, persistent, or malformed snapshots so the caller reloads PostgreSQL. Redis errors propagate. */
export async function readBalanceCache(redis: Redis, userId: string): Promise<number | null> {
  const snapshot = await readCache(redis, userFluxRedisKey(userId))
  const balance = safeParse(balanceSchema, snapshot)
  // Invalid snapshots cannot authorize usage. The caller reads the database
  // and replaces the snapshot instead of trusting a partially parsed number.
  return balance.success ? balance.output : null
}

/** Caches a database balance for one minute. Call only after the owning transaction commits. Redis errors propagate. */
export async function writeBalanceCache(redis: Redis, userId: string, balance: number): Promise<void> {
  await writeCache(redis, userFluxRedisKey(userId), String(balance), { ttlSeconds })
}

/** Invalidates a balance after its database mutation commits. Redis errors propagate. */
export async function invalidateBalanceCache(redis: Redis, userId: string): Promise<void> {
  await redis.del(userFluxRedisKey(userId))
}
