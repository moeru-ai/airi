import type { Context } from 'hono'

import type { HonoEnv } from '../types/hono'

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
    standardHeaders: 'draft-6',
    keyGenerator: opts.keyGenerator
      ?? (c => c.get('user')?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous'),
  })
}
