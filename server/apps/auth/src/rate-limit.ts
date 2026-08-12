import type { Context } from 'hono'
import type Redis from 'ioredis'

import type { RateLimitMetrics } from './otel'
import type { HonoEnv } from './routes'

import { isIP } from 'node:net'

import { getConnInfo } from '@hono/node-server/conninfo'
import { errorMessageFrom } from '@moeru/std'
import { rateLimiter as createRateLimiter } from 'hono-rate-limiter'
import { number, parse } from 'valibot'

import { createServiceUnavailableError } from './error'

export interface AuthRateLimitConfig {
  max: number
  windowSec: number
}

export function createAuthConfigService(redis: Redis) {
  async function readNumber(key: 'AUTH_RATE_LIMIT_MAX' | 'AUTH_RATE_LIMIT_WINDOW_SEC', defaultValue: number): Promise<number> {
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

interface RateLimitOptions {
  /** Max requests allowed within the window */
  max: number
  /** Window size in seconds */
  windowSec: number
  /** Key generator: extracts a unique identifier from the request */
  keyGenerator?: (c: Context<HonoEnv>) => string
  /**
   * Reverse proxy whose client-address header is safe to use. The caller must
   * select this only when the deployment guarantees that the named proxy owns
   * and overwrites that header before the request reaches the application.
   */
  trustedProxy?: 'railway'
  /**
   * Optional metrics handle. When provided, blocked requests increment
   * `airi_rate_limit_blocked_total{route, key_type, limit}`.
   * `key_type` reflects whether the limiter keyed off authenticated user id
   * or remote IP — important for distinguishing logged-in abuse from
   * anonymous scraping.
   */
  metrics?: RateLimitMetrics | null
  /**
   * Stable label for the route this limiter guards (e.g. `auth.api`,
   * `openai.completions`, `stripe.checkout`). Avoids high-cardinality URL
   * paths in metric labels.
   */
  routeLabel?: string
}

/**
 * Rate limiter middleware powered by hono-rate-limiter.
 * Uses in-memory store by default (single-instance).
 */
export function rateLimiter(opts: RateLimitOptions) {
  const keyGen = opts.keyGenerator
    ?? ((c) => {
      const userId = c.get('user')?.id
      if (userId)
        return userId

      const trustedProxyAddress = getTrustedProxyClientAddress(c, opts.trustedProxy)
      if (trustedProxyAddress)
        return trustedProxyAddress

      // `app.request()` and fetch-style deployments have no Node incoming
      // socket. Keep those requests in a shared bucket rather than trusting a
      // client-controlled forwarding header.
      try {
        const info = getConnInfo(c)
        return info.remote?.address ?? 'anonymous'
      }
      catch {
        return 'anonymous'
      }
    })

  return createRateLimiter<HonoEnv>({
    windowMs: opts.windowSec * 1000,
    limit: opts.max,
    // NOTICE: keep `draft-6` so the middleware emits the widely supported
    // `RateLimit-*` header set. `draft-7`/`draft-8` switch to newer combined
    // header formats that are easier to break in existing clients and proxies.
    standardHeaders: 'draft-6',
    keyGenerator: keyGen,
    handler: (c) => {
      // Record before producing the 429 response so the time series captures
      // every block, even when the response shape later changes.
      const keyType = c.get('user')?.id ? 'user' : 'ip'
      opts.metrics?.blocked.add(1, {
        route: opts.routeLabel ?? 'unknown',
        key_type: keyType,
        limit: String(opts.max),
      })
      return c.json({ error: 'TOO_MANY_REQUESTS', message: 'Too many requests' }, 429)
    },
  })
}

/**
 * Uses Railway's canonical client address only after the deployment explicitly
 * opts into that trust boundary. Proxy transport details do not affect it.
 */
function getTrustedProxyClientAddress(c: Context<HonoEnv>, trustedProxy: RateLimitOptions['trustedProxy']): string | undefined {
  if (trustedProxy !== 'railway')
    return undefined

  const clientAddress = c.req.header('x-real-ip')?.trim()
  if (!clientAddress || isIP(clientAddress) === 0)
    return undefined

  return clientAddress
}
