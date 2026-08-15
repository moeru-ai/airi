import type { InferOutput } from 'valibot'

import type { ConfigKey } from './definitions'

import { finite, keyof, number, object, parse, parseJson, pipe, string } from 'valibot'

import { configEntrySchemas } from './definitions'

export const CONFIG_KV_CACHE_TTL_SECONDS = 300
export const CONFIG_KV_INVALIDATION_CHANNEL = 'configkv:invalidate'

const configKVInvalidationPayloadSchema = object({
  key: keyof(
    object(configEntrySchemas),
    'ConfigKV invalidation key is unknown',
  ),
  version: pipe(
    number('ConfigKV invalidation version must be a number'),
    finite('ConfigKV invalidation version must be a number'),
  ),
  publishedAt: pipe(
    number('ConfigKV invalidation publishedAt must be a number'),
    finite('ConfigKV invalidation publishedAt must be a number'),
  ),
})

const configKVInvalidationSchema = pipe(
  string('ConfigKV invalidation must be a string'),
  parseJson({}, 'ConfigKV invalidation must be valid JSON'),
  configKVInvalidationPayloadSchema,
)

export type ConfigKVInvalidation = InferOutput<typeof configKVInvalidationPayloadSchema>

/** Returns the Redis cache key for one ConfigKV entry. */
export function configKVCacheKey(key: ConfigKey): string {
  return `cache:config:${key}`
}

/** Parses one ConfigKV invalidation message. */
export function parseConfigKVInvalidation(raw: string): ConfigKVInvalidation {
  return parse(configKVInvalidationSchema, raw)
}
