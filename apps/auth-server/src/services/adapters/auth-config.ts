import type Redis from 'ioredis'

import { errorMessageFrom } from '@moeru/std'
import { number, parse } from 'valibot'

import { createServiceUnavailableError } from '../../utils/error'

export interface AuthRateLimitConfig {
  /** Maximum requests accepted from one limiter key during the window. */
  max: number
  /** Limiter window duration in seconds. */
  windowSec: number
}

/**
 * Reads the small runtime configuration surface owned by Auth.
 *
 * The storage keys stay compatible with the shared Redis ConfigKV namespace,
 * while Auth does not import the API's LLM, billing, or provider schemas.
 */
export function createAuthConfigService(redis: Redis) {
  async function readNumber(key: 'AUTH_RATE_LIMIT_MAX' | 'AUTH_RATE_LIMIT_WINDOW_SEC', defaultValue: number): Promise<number> {
    // Keep compatibility with the shared ConfigKV namespace without importing
    // the resource API's broader configuration service.
    const raw = await redis.get(`config:${key}`)
    if (raw === null)
      return defaultValue

    try {
      return parse(number(), JSON.parse(raw))
    }
    catch (error) {
      throw createServiceUnavailableError('Auth configuration is invalid', 'CONFIG_INVALID', {
        key,
        message: errorMessageFrom(error) ?? 'Unknown config parse error',
      })
    }
  }

  return {
    async getRateLimit(): Promise<AuthRateLimitConfig> {
      const [max, windowSec] = await Promise.all([
        readNumber('AUTH_RATE_LIMIT_MAX', 20),
        readNumber('AUTH_RATE_LIMIT_WINDOW_SEC', 60),
      ])
      return { max, windowSec }
    },
  }
}

export type AuthConfigService = ReturnType<typeof createAuthConfigService>
