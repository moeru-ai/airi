import type { Context } from 'hono'

import type { RateLimitMetrics } from './otel'
import type { HonoEnv } from './routes'

import { isIP } from 'node:net'

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

      // app.request() and fetch-style deployments have no Node incoming
      // socket. Keep them in one bucket instead of trusting client headers.
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
    // NOTICE: draft-6 keeps the widely supported RateLimit-* header set.
    // Later drafts use combined formats that existing clients may not parse.
    standardHeaders: 'draft-6',
    keyGenerator: keyGen,
    handler: (c) => {
      // Record the block before producing the response so later response
      // changes cannot remove the metric.
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
