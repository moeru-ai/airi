import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import { boolean, minValue, nullable, number, object, pipe, safeInteger, safeParse, string } from 'valibot'

import { readCache, writeCache } from '../../libs/redis/cache'
import { userFluxRedisKey } from '../../utils/redis-keys'

/** A wallet snapshot carries both buckets and confirmed outstanding fees. Expiry stays raw so each read judges it. */
export const walletSnapshotSchema = object({
  flux: pipe(number(), safeInteger(), minValue(0)),
  unsettledMicroFlux: pipe(number(), safeInteger(), minValue(0)),
  capacitorFlux: pipe(number(), safeInteger(), minValue(0)),
  capacitorQuota: pipe(number(), safeInteger(), minValue(0)),
  capacitorExpiresAt: nullable(string()),
  capacitorRechargesAt: nullable(string()),
  fallbackToFlux: boolean(),
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
