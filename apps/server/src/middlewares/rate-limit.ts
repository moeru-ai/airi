import type { Context } from 'hono'

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
}

/**
 * Rate limiter middleware powered by hono-rate-limiter.
 * Uses in-memory store by default (single-instance).
 */
export function rateLimiter(opts: RateLimitOptions) {
  return createRateLimiter<HonoEnv>({
    windowMs: opts.windowSec * 1000,
    limit: opts.max,
    // NOTICE: keep `draft-6` so the middleware emits the widely supported
    // `RateLimit-*` header set. `draft-7`/`draft-8` switch to newer combined
    // header formats that are easier to break in existing clients and proxies.
    standardHeaders: 'draft-6',
    keyGenerator: opts.keyGenerator
      ?? ((c) => {
        const userId = c.get('user')?.id
        if (userId)
          return userId

        // NOTICE: prefer hono conninfo (uses underlying socket address) over
        // x-forwarded-for which can be spoofed. Falls back to header then 'anonymous'.
        const info = getConnInfo(c)
        return info.remote?.address ?? c.req.header('x-forwarded-for') ?? 'anonymous'
      }),
  })
}
