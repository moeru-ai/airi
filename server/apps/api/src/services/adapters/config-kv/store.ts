import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type Redis from 'ioredis'

import type { ConfigKey } from './definitions'

import { eq } from 'drizzle-orm'

import { cacheRevision, invalidateCache, publishCache } from '../../../libs/revision-cache'
import { configKV } from '../../../schemas/config-kv'
import { CONFIG_KV_CACHE_TTL_SECONDS, configKVCacheKey } from './contracts'

export interface ConfigKVStoreOptions {
  /**
   * Maximum lifetime of one derived Redis entry.
   * @default 300
   */
  cacheTtlSeconds?: number
}

/**
 * Creates a read-only ConfigKV store with Redis cache-aside reads.
 *
 * PostgreSQL is the source of truth. A Redis error fails the operation so this
 * boundary never serves ConfigKV while its cache dependency is unavailable.
 */
export function createConfigKVStore<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
  redis: Redis,
  options: ConfigKVStoreOptions = {},
) {
  const cacheTtlSeconds = options.cacheTtlSeconds ?? CONFIG_KV_CACHE_TTL_SECONDS

  async function readDatabase(key: ConfigKey): Promise<string | null> {
    const rows = await db
      .select({ value: configKV.value })
      .from(configKV)
      .where(eq(configKV.key, key))
      .limit(1)
    return rows[0]?.value ?? null
  }

  async function cacheValue(key: ConfigKey, value: string, revision: string): Promise<void> {
    const cacheKey = configKVCacheKey(key)
    await publishCache(redis, cacheKey, `${cacheKey}:revision`, revision, value, cacheTtlSeconds)
  }

  async function deleteCachedValue(key: ConfigKey): Promise<void> {
    await invalidateCache(redis, configKVCacheKey(key))
  }

  return {
    async getRaw(key: ConfigKey): Promise<string | null> {
      const cached = await redis.get(configKVCacheKey(key))
      if (cached !== null)
        return cached

      const revision = await cacheRevision(redis, `${configKVCacheKey(key)}:revision`)
      const value = await readDatabase(key)
      if (value !== null)
        await cacheValue(key, value, revision)
      return value
    },

    async getFreshRaw(key: ConfigKey): Promise<string | null> {
      const revision = await cacheRevision(redis, `${configKVCacheKey(key)}:revision`)
      const value = await readDatabase(key)
      if (value !== null) {
        await cacheValue(key, value, revision)
      }
      else {
        await deleteCachedValue(key)
      }
      return value
    },

    async invalidateCache(key: ConfigKey): Promise<void> {
      await deleteCachedValue(key)
    },
  }
}

export type ConfigKVStore = ReturnType<typeof createConfigKVStore>
