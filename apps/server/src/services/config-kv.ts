import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import { array, number, object, optional, parse, string } from 'valibot'

import { createServiceUnavailableError } from '../utils/error'
import { configRedisKey } from '../utils/redis-keys'

export interface FluxPackage {
  /** Amount in cents sent to Stripe */
  amount: number
  /** How much Flux the buyer receives for this package */
  fluxAmount: number
  /** Display label, e.g. "500 Flux" */
  label: string
  /** Display price, e.g. "$5" */
  price: string
}

const FluxPackageSchema = object({ amount: number(), fluxAmount: number(), label: string(), price: string() })

/**
 * Config entry schemas are the single source of truth for:
 * - runtime validation
 * - default values
 * - Redis serialization/deserialization shape
 */
const ConfigEntrySchemas = {
  FLUX_PER_REQUEST: optional(number(), 5),
  FLUX_PER_REQUEST_TTS: number(),
  FLUX_PER_REQUEST_ASR: number(),
  INITIAL_USER_FLUX: optional(number(), 0),
  FLUX_PACKAGES: optional(array(FluxPackageSchema), []),
  FLUX_PER_1K_TOKENS: optional(number(), 1),
  MAX_CHECKOUT_AMOUNT_CENTS: optional(number(), 1_000_000),
  GATEWAY_BASE_URL: string(),
  DEFAULT_CHAT_MODEL: string(),
  AUTH_RATE_LIMIT_MAX: optional(number(), 20),
  AUTH_RATE_LIMIT_WINDOW_SEC: optional(number(), 60),
} as const

type ConfigDefinitions = {
  [K in keyof typeof ConfigEntrySchemas]: InferOutput<(typeof ConfigEntrySchemas)[K]>
}

type ConfigKey = keyof ConfigDefinitions

function parseValue<K extends ConfigKey>(key: K, raw: string): ConfigDefinitions[K] {
  return parse(ConfigEntrySchemas[key], JSON.parse(raw)) as ConfigDefinitions[K]
}

function serializeValue<K extends ConfigKey>(key: K, value: ConfigDefinitions[K]): string {
  return JSON.stringify(parse(ConfigEntrySchemas[key], value))
}

/**
 * Resolve a config value: read from Redis, then apply valibot default if missing.
 * Returns `undefined` if both Redis and schema have no value (required key, not set).
 */
function resolveWithDefault<K extends ConfigKey>(key: K, raw: string | null): ConfigDefinitions[K] | undefined {
  if (raw !== null)
    return parseValue(key, raw)

  // Use the per-key schema with `undefined` to trigger the key default
  try {
    return parse(ConfigEntrySchemas[key], undefined) as ConfigDefinitions[K]
  }
  catch {
    return undefined
  }
}

export function createConfigKVService(redis: Redis) {
  return {
    async getOptional<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K] | null> {
      const raw = await redis.get(configRedisKey(key))
      const value = resolveWithDefault(key, raw)
      return value ?? null
    },

    async getOrThrow<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K]> {
      const raw = await redis.get(configRedisKey(key))
      const value = resolveWithDefault(key, raw)
      if (value === undefined)
        throw createServiceUnavailableError('Service configuration is incomplete', 'CONFIG_NOT_SET')

      return value
    },

    async get<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K]> {
      return this.getOrThrow(key)
    },

    async set<K extends ConfigKey>(key: K, value: ConfigDefinitions[K]): Promise<void> {
      const serialized = serializeValue(key, value)
      await redis.set(configRedisKey(key), serialized)
    },
  }
}

export type ConfigKVService = ReturnType<typeof createConfigKVService>
