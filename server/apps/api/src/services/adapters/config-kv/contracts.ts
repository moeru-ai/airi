import type { ConfigKey } from './definitions'

import { isConfigKey } from './definitions'

export const CONFIG_KV_CACHE_TTL_SECONDS = 300
export const CONFIG_KV_INVALIDATION_CHANNEL = 'configkv:invalidate'

export interface ConfigKVInvalidation {
  key: ConfigKey
  version: number
  publishedAt: number
}

/** Returns the Redis cache key for one ConfigKV entry. */
export function configKVCacheKey(key: ConfigKey): string {
  return `cache:config:${key}`
}

/** Parses one ConfigKV invalidation message. */
export function parseConfigKVInvalidation(raw: string): ConfigKVInvalidation {
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null)
    throw new TypeError('ConfigKV invalidation must be an object')

  const payload = value as Record<string, unknown>
  if (typeof payload.key !== 'string' || !isConfigKey(payload.key))
    throw new TypeError('ConfigKV invalidation key is unknown')
  if (typeof payload.version !== 'number' || !Number.isFinite(payload.version))
    throw new TypeError('ConfigKV invalidation version must be a number')
  if (typeof payload.publishedAt !== 'number' || !Number.isFinite(payload.publishedAt))
    throw new TypeError('ConfigKV invalidation publishedAt must be a number')

  return {
    key: payload.key,
    version: payload.version,
    publishedAt: payload.publishedAt,
  }
}
