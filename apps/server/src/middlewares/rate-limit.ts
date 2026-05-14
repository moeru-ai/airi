import type { Context } from 'hono'

import type { RateLimitMetrics } from '../otel'
import type { HonoEnv } from '../types/hono'

import { getConnInfo } from '@hono/node-server/conninfo'
import { rateLimiter as createRateLimiter } from 'hono-rate-limiter'

interface RateLimitOptions {
  /** Max requests allowed within the window */
  max: number
  /** Window size in seconds */
  windowSec: number
  /** Key generator: extracts a unique identifier from the request */
  keyGenerator?: (c: Context<HonoEnv>) => string
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

      // NOTICE: prefer hono conninfo (uses underlying socket address) over
      // x-forwarded-for which can be spoofed. Falls back to header then 'anonymous'.
      const info = getConnInfo(c)
      return info.remote?.address ?? c.req.header('x-forwarded-for') ?? 'anonymous'
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
