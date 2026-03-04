import type Redis from 'ioredis'

import { createServiceUnavailableError } from '../utils/error'

interface ConfigDefinitions {
  FLUX_PER_CENT: number
  FLUX_PER_REQUEST: number
  INITIAL_USER_FLUX: number
}

const KEY_PREFIX = 'config:'

export function createConfigKVService(redis: Redis) {
  return {
    async get<K extends keyof ConfigDefinitions>(key: K): Promise<ConfigDefinitions[K]> {
      const raw = await redis.get(`${KEY_PREFIX}${key}`)
      if (raw === null)
        throw createServiceUnavailableError(`Config key "${key}" is not set in Redis`, 'CONFIG_NOT_SET')

      return Number(raw) as ConfigDefinitions[K]
    },

    async set<K extends keyof ConfigDefinitions>(key: K, value: ConfigDefinitions[K]): Promise<void> {
      await redis.set(`${KEY_PREFIX}${key}`, String(value))
    },
  }
}

export type ConfigKVService = ReturnType<typeof createConfigKVService>
