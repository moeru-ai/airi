import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import { array, number, object, optional, parse, string } from 'valibot'

import { createServiceUnavailableError } from '../utils/error'

export interface FluxPackage {
  /** Amount in cents sent to Stripe */
  amount: number
  /** Display label, e.g. "500 Flux" */
  label: string
  /** Display price, e.g. "$5" */
  price: string
}

/**
 * Config schema with valibot defaults.
 * Keys with `optional(..., defaultValue)` will fall back when Redis returns null.
 * Keys without a default will throw via `getOrThrow` if not set.
 */
const ConfigSchema = object({
  FLUX_PER_CENT: optional(number(), 10),
  FLUX_PER_REQUEST: optional(number(), 5),
  FLUX_PER_REQUEST_TTS: number(),
  FLUX_PER_REQUEST_ASR: number(),
  INITIAL_USER_FLUX: optional(number(), 0),
  FLUX_PACKAGES: optional(array(object({ amount: number(), label: string(), price: string() })), []),
  FLUX_PER_1K_TOKENS: optional(number(), 1),
  GATEWAY_BASE_URL: string(),
  DEFAULT_CHAT_MODEL: string(),
})

type ConfigDefinitions = InferOutput<typeof ConfigSchema>

const NUMERIC_KEYS = new Set<keyof ConfigDefinitions>(['FLUX_PER_CENT', 'FLUX_PER_REQUEST', 'FLUX_PER_REQUEST_TTS', 'FLUX_PER_REQUEST_ASR', 'INITIAL_USER_FLUX', 'FLUX_PER_1K_TOKENS'])

const KEY_PREFIX = 'config:'

function parseValue<K extends keyof ConfigDefinitions>(key: K, raw: string): ConfigDefinitions[K] {
  if (key === 'FLUX_PACKAGES')
    return JSON.parse(raw) as ConfigDefinitions[K]
  if (NUMERIC_KEYS.has(key))
    return Number(raw) as ConfigDefinitions[K]
  return raw as ConfigDefinitions[K]
}

/**
 * Resolve a config value: read from Redis, then apply valibot default if missing.
 * Returns `undefined` if both Redis and schema have no value (required key, not set).
 */
function resolveWithDefault<K extends keyof ConfigDefinitions>(key: K, raw: string | null): ConfigDefinitions[K] | undefined {
  if (raw !== null)
    return parseValue(key, raw)

  // Use valibot parse with `undefined` to trigger the schema default
  try {
    const result = parse(ConfigSchema, { [key]: undefined })
    return result[key] as ConfigDefinitions[K]
  }
  catch {
    return undefined
  }
}

export function createConfigKVService(redis: Redis) {
  return {
    async getOptional<K extends keyof ConfigDefinitions>(key: K): Promise<ConfigDefinitions[K] | null> {
      const raw = await redis.get(`${KEY_PREFIX}${key}`)
      const value = resolveWithDefault(key, raw)
      return value ?? null
    },

    async getOrThrow<K extends keyof ConfigDefinitions>(key: K): Promise<ConfigDefinitions[K]> {
      const raw = await redis.get(`${KEY_PREFIX}${key}`)
      const value = resolveWithDefault(key, raw)
      if (value === undefined)
        throw createServiceUnavailableError('Service configuration is incomplete', 'CONFIG_NOT_SET')

      return value
    },

    async get<K extends keyof ConfigDefinitions>(key: K): Promise<ConfigDefinitions[K]> {
      return this.getOrThrow(key)
    },

    async set<K extends keyof ConfigDefinitions>(key: K, value: ConfigDefinitions[K]): Promise<void> {
      const serialized = key === 'FLUX_PACKAGES' ? JSON.stringify(value) : String(value)
      await redis.set(`${KEY_PREFIX}${key}`, serialized)
    },
  }
}

export type ConfigKVService = ReturnType<typeof createConfigKVService>
