import type { ConfigDefinitions, ConfigKey } from './definitions'
import type { ConfigKVStore } from './store'

import { errorMessageFrom } from '@moeru/std'
import { parse } from 'valibot'

import { createServiceUnavailableError } from '../../../utils/error'
import { configEntrySchemas } from './definitions'

export * from './definitions'

function parseValue<K extends ConfigKey>(key: K, raw: string): ConfigDefinitions[K] {
  try {
    return parse(configEntrySchemas[key], JSON.parse(raw)) as ConfigDefinitions[K]
  }
  catch (error) {
    throw createServiceUnavailableError(
      'Service configuration is invalid',
      'CONFIG_INVALID',
      {
        key,
        message: errorMessageFrom(error) ?? 'Unknown config parse error',
      },
    )
  }
}

/** Resolves a config value and applies the Valibot default when the row is missing. */
function resolveWithDefault<K extends ConfigKey>(key: K, raw: string | null): ConfigDefinitions[K] | undefined {
  if (raw !== null)
    return parseValue(key, raw)

  try {
    return parse(configEntrySchemas[key], undefined) as ConfigDefinitions[K]
  }
  catch {
    return undefined
  }
}

/**
 * Creates the API's typed, read-only ConfigKV boundary.
 *
 * PostgreSQL owns persisted values. Redis must be available for every store
 * operation. This layer preserves validation, defaults, and API errors.
 */
export function createConfigKVService(store: ConfigKVStore) {
  async function loadRaw(key: ConfigKey, fresh = false): Promise<string | null> {
    try {
      return fresh ? await store.getFreshRaw(key) : await store.getRaw(key)
    }
    catch (error) {
      throw createServiceUnavailableError(
        'Service configuration is unavailable',
        'CONFIG_UNAVAILABLE',
        {
          key,
          message: errorMessageFrom(error) ?? 'Unknown config store error',
        },
      )
    }
  }

  return {
    async getOptional<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K] | null> {
      const raw = await loadRaw(key)
      const value = resolveWithDefault(key, raw)
      return value ?? null
    },

    async getOrThrow<K extends ConfigKey>(key: K): Promise<Exclude<ConfigDefinitions[K], undefined>> {
      const raw = await loadRaw(key)
      const value = resolveWithDefault(key, raw)
      if (value === undefined)
        throw createServiceUnavailableError('Service configuration is incomplete', 'CONFIG_NOT_SET')

      return value as Exclude<ConfigDefinitions[K], undefined>
    },

    async get<K extends ConfigKey>(key: K): Promise<Exclude<ConfigDefinitions[K], undefined>> {
      return this.getOrThrow(key)
    },

    async refresh<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K] | null> {
      const raw = await loadRaw(key, true)
      const value = resolveWithDefault(key, raw)
      return value ?? null
    },

    async invalidateCache<K extends ConfigKey>(key: K): Promise<void> {
      await store.invalidateCache(key)
    },
  }
}

export type ConfigKVService = ReturnType<typeof createConfigKVService>
