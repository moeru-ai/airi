import type { Context } from 'hono'

import type { RateLimitMetrics } from '../otel'
import type { HonoEnv } from '../types/hono'

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
   * select this only for a deployment that prevents direct public access to
   * the application process.
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
 * Returns Railway's canonical client address only for a request received from
 * its internal proxy network.
 *
 * Before:
 * - a client could send `X-Forwarded-For: 203.0.113.1` and choose its bucket
 *
 * After:
 * - `X-Real-IP` is used only when Railway's edge marker and an internal socket
 *   prove the request traversed the configured Railway proxy boundary
 */
function getTrustedProxyClientAddress(c: Context<HonoEnv>, trustedProxy: RateLimitOptions['trustedProxy']): string | undefined {
  if (trustedProxy !== 'railway')
    return undefined

  try {
    const remoteAddress = getConnInfo(c).remote?.address
    const edge = c.req.header('x-railway-edge')
    const clientAddress = c.req.header('x-real-ip')?.trim()
    if (!isRailwayInternalAddress(remoteAddress) || !edge?.startsWith('railway/') || !clientAddress || isIP(clientAddress) === 0)
      return undefined

    return clientAddress
  }
  catch {
    return undefined
  }
}

/**
 * Identifies address ranges Railway documents for internal proxy traffic.
 *
 * Before:
 * - `203.0.113.42`
 *
 * After:
 * - `100.64.0.42`
 */
function isRailwayInternalAddress(address: string | undefined): boolean {
  if (!address)
    return false

  const normalizedAddress = address.replace(/^::ffff:/i, '')
  const octets = normalizedAddress.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255))
    return false

  const [first, second] = octets
  return first === 10
    || first === 100
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}
