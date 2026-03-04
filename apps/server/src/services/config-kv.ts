import type Redis from 'ioredis'

import { createServiceUnavailableError } from '../utils/error'

export interface FluxPackage {
  /** Amount in cents sent to Stripe */
  amount: number
  /** Display label, e.g. "500 Flux" */
  label: string
  /** Display price, e.g. "$5" */
  price: string
}

interface ConfigDefinitions {
  FLUX_PER_CENT: number
  FLUX_PER_REQUEST: number
  INITIAL_USER_FLUX: number
  GATEWAY_BASE_URL: string
  FLUX_PACKAGES: FluxPackage[]
}

const NUMERIC_KEYS = new Set<string>(['FLUX_PER_CENT', 'FLUX_PER_REQUEST', 'INITIAL_USER_FLUX'])
const JSON_KEYS = new Set<string>(['FLUX_PACKAGES'])

const KEY_PREFIX = 'config:'

function parseValue<K extends keyof ConfigDefinitions>(key: K, raw: string): ConfigDefinitions[K] {
  if (JSON_KEYS.has(key))
    return JSON.parse(raw) as ConfigDefinitions[K]
  if (NUMERIC_KEYS.has(key))
    return Number(raw) as ConfigDefinitions[K]
  return raw as ConfigDefinitions[K]
}

function serializeValue<K extends keyof ConfigDefinitions>(key: K, value: ConfigDefinitions[K]): string {
  if (key === 'FLUX_PACKAGES')
    return JSON.stringify(value)
  return String(value)
}

export function createConfigKVService(redis: Redis) {
  return {
    async getOptional<K extends keyof ConfigDefinitions>(key: K): Promise<ConfigDefinitions[K] | null> {
      const raw = await redis.get(`${KEY_PREFIX}${key}`)
      if (raw === null)
        return null

      return parseValue(key, raw)
    },

    async get<K extends keyof ConfigDefinitions>(key: K): Promise<ConfigDefinitions[K]> {
      const value = await this.getOptional(key)
      if (value === null)
        throw createServiceUnavailableError(`Config key "${key}" is not set in Redis`, 'CONFIG_NOT_SET')

      return value
    },

    async set<K extends keyof ConfigDefinitions>(key: K, value: ConfigDefinitions[K]): Promise<void> {
      await redis.set(`${KEY_PREFIX}${key}`, serializeValue(key, value))
    },
  }
}

export type ConfigKVService = ReturnType<typeof createConfigKVService>
