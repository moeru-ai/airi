import type { MiddlewareHandler } from 'hono'

import type { ConfigKVService } from '../services/config-kv'
import type { HonoEnv } from '../types/hono'

import { createServiceUnavailableError } from '../utils/error'

/**
 * Middleware factory that checks required config keys exist in Redis.
 * Returns 503 if any key is missing.
 */
export function configGuard(
  configKV: ConfigKVService,
  keys: Parameters<ConfigKVService['getOrThrow']>[0][],
  message = 'Service is not available yet',
): MiddlewareHandler<HonoEnv> {
  return async (_c, next) => {
    for (const key of keys) {
      const value = await configKV.getOptional(key)
      if (value === null)
        throw createServiceUnavailableError(message, 'CONFIG_NOT_SET')
    }
    await next()
  }
}
