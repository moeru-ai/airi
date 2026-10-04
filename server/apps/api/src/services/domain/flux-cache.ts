import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import { minValue, number, object, pipe, safeInteger, safeParse } from 'valibot'

import { readCache, writeCache } from '../../libs/redis/cache'
import { userFluxRedisKey } from '../../utils/redis-keys'

/** A wallet snapshot always carries both integer balance and confirmed outstanding fees. */
export const walletSnapshotSchema = object({
  flux: pipe(number(), safeInteger(), minValue(0)),
  unsettledMicroFlux: pipe(number(), safeInteger(), minValue(0)),
})
export type WalletSnapshot = InferOutput<typeof walletSnapshotSchema>
const ttlSeconds = 60

/** Returns null for absent or invalid snapshots. Admission reads PostgreSQL independently of this display cache. */
export async function readBalanceCache(redis: Redis, userId: string): Promise<WalletSnapshot | null> {
  const snapshot = await readCache(redis, userFluxRedisKey(userId))
  if (snapshot === null)
    return null
  let value: unknown
  try {
    value = JSON.parse(snapshot)
  }
  catch {
    return null
  }
  const parsed = safeParse(walletSnapshotSchema, value)
  return parsed.success ? parsed.output : null
}

/** Caches a complete database wallet snapshot for one minute. */
export async function writeBalanceCache(redis: Redis, userId: string, wallet: WalletSnapshot): Promise<void> {
  await writeCache(redis, userFluxRedisKey(userId), JSON.stringify(wallet), { ttlSeconds })
}

/** Invalidates the wallet snapshot after its owning transaction commits. */
export async function invalidateBalanceCache(redis: Redis, userId: string): Promise<void> {
  await redis.del(userFluxRedisKey(userId))
}
