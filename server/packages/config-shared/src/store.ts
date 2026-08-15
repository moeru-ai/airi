import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type Redis from 'ioredis'

import { eq } from 'drizzle-orm'

import { CONFIG_KV_CACHE_TTL_SECONDS, configKVCacheKey } from './contracts'
import { configKV } from './schema'

export interface ConfigKVCacheError {
  error: unknown
  key: string
  operation: 'delete' | 'read' | 'write'
}

export interface ConfigKVStoreOptions {
  /**
   * Maximum lifetime of one derived Redis entry.
   * @default 300
   */
  cacheTtlSeconds?: number
  /** Reports cache errors that the store bypasses. */
  onCacheError?: (input: ConfigKVCacheError) => void
}

/**
 * Creates a read-only ConfigKV store with Redis cache-aside reads.
 *
 * PostgreSQL is the source of truth. Redis failures do not block a database read.
 */
export function createConfigKVStore<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
  redis: Redis,
  options: ConfigKVStoreOptions = {},
) {
  const cacheTtlSeconds = options.cacheTtlSeconds ?? CONFIG_KV_CACHE_TTL_SECONDS

  function reportCacheError(operation: ConfigKVCacheError['operation'], key: string, error: unknown): void {
    options.onCacheError?.({ error, key, operation })
  }

  async function readDatabase(key: string): Promise<string | null> {
    const rows = await db
      .select({ value: configKV.value })
      .from(configKV)
      .where(eq(configKV.key, key))
      .limit(1)
    return rows[0]?.value ?? null
  }

  async function cacheValue(key: string, value: string): Promise<void> {
    try {
      await redis.set(configKVCacheKey(key), value, 'EX', cacheTtlSeconds)
    }
    catch (error) {
      reportCacheError('write', key, error)
    }
  }

  async function deleteCachedValue(key: string): Promise<void> {
    try {
      await redis.del(configKVCacheKey(key))
    }
    catch (error) {
      reportCacheError('delete', key, error)
    }
  }

  return {
    async getRaw(key: string): Promise<string | null> {
      try {
        const cached = await redis.get(configKVCacheKey(key))
        if (cached !== null)
          return cached
      }
      catch (error) {
        reportCacheError('read', key, error)
      }

      const value = await readDatabase(key)
      if (value !== null)
        await cacheValue(key, value)
      return value
    },

    async getFreshRaw(key: string): Promise<string | null> {
      const value = await readDatabase(key)
      if (value !== null) {
        await cacheValue(key, value)
      }
      else {
        await deleteCachedValue(key)
      }
      return value
    },

    async invalidateCache(key: string): Promise<void> {
      await deleteCachedValue(key)
    },
  }
}

export type ConfigKVStore = ReturnType<typeof createConfigKVStore>
