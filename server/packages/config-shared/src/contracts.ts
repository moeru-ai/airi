export const CONFIG_KV_CACHE_TTL_SECONDS = 300
export const CONFIG_KV_INVALIDATION_CHANNEL = 'configkv:invalidate'

export interface ConfigKVInvalidation {
  key: string
  version: number
  publishedAt: number
}

/** Returns the shared Redis cache key for one ConfigKV entry. */
export function configKVCacheKey(key: string): string {
  const normalizedKey = key.trim()
  if (!normalizedKey)
    throw new TypeError('ConfigKV key must not be empty')

  return `cache:config:${normalizedKey}`
}

/** Parses one ConfigKV invalidation message. */
export function parseConfigKVInvalidation(raw: string): ConfigKVInvalidation {
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null)
    throw new TypeError('ConfigKV invalidation must be an object')

  const payload = value as Record<string, unknown>
  if (typeof payload.key !== 'string' || !payload.key.trim())
    throw new TypeError('ConfigKV invalidation key must not be empty')
  if (typeof payload.version !== 'number' || !Number.isFinite(payload.version))
    throw new TypeError('ConfigKV invalidation version must be a number')
  if (typeof payload.publishedAt !== 'number' || !Number.isFinite(payload.publishedAt))
    throw new TypeError('ConfigKV invalidation publishedAt must be a number')

  return {
    key: payload.key.trim(),
    version: payload.version,
    publishedAt: payload.publishedAt,
  }
}
