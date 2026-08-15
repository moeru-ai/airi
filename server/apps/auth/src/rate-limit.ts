import type { useLogger } from '@guiiai/logg'
import type { ConfigKVStore } from '@proj-airi/config-shared'
import type { Context, MiddlewareHandler } from 'hono'
import type Redis from 'ioredis'

import type { RateLimitMetrics } from './otel'
import type { HonoEnv } from './routes'

import { isIP } from 'node:net'

import { getConnInfo } from '@hono/node-server/conninfo'
import { errorMessageFrom } from '@moeru/std'
import { CONFIG_KV_INVALIDATION_CHANNEL, parseConfigKVInvalidation } from '@proj-airi/config-shared'
import { rateLimiter as createRateLimiter, MemoryStore } from 'hono-rate-limiter'
import { integer, minValue, number, parse, pipe } from 'valibot'

import { createServiceUnavailableError } from './error'

export interface AuthRateLimitConfig {
  max: number
  windowSec: number
}

type AuthRateLimitKey = 'AUTH_RATE_LIMIT_MAX' | 'AUTH_RATE_LIMIT_WINDOW_SEC'
type RateLimitChangeListener = (config: AuthRateLimitConfig) => Promise<void> | void
type StopListener = () => Promise<void> | void

interface AuthConfigServiceOptions {
  logger: ReturnType<typeof useLogger>
}

/**
 * Creates Auth's PostgreSQL-backed config reader and Pub/Sub reload owner.
 *
 * A reload reads both rate-limit keys directly from PostgreSQL before it
 * publishes one replacement config. Invalid hot updates never reach listeners.
 */
export function createAuthConfigService(
  store: ConfigKVStore,
  redis: Redis,
  options: AuthConfigServiceOptions,
) {
  const listeners = new Set<RateLimitChangeListener>()
  const stopListeners = new Set<StopListener>()
  const subscriber = redis.duplicate()
  let reloadQueue = Promise.resolve()

  async function readNumber(key: AuthRateLimitKey, defaultValue: number, fresh: boolean): Promise<number> {
    const raw = fresh ? await store.getFreshRaw(key) : await store.getRaw(key)
    if (raw === null)
      return defaultValue

    try {
      return parse(pipe(number(), integer(), minValue(1)), JSON.parse(raw))
    }
    catch (error) {
      throw createServiceUnavailableError('Auth configuration is invalid', 'CONFIG_INVALID', {
        key,
        message: errorMessageFrom(error) ?? 'Unknown config parse error',
      })
    }
  }

  async function readRateLimit(fresh: boolean): Promise<AuthRateLimitConfig> {
    const [max, windowSec] = await Promise.all([
      readNumber('AUTH_RATE_LIMIT_MAX', 20, fresh),
      readNumber('AUTH_RATE_LIMIT_WINDOW_SEC', 60, fresh),
    ])
    return { max, windowSec }
  }

  async function reload(): Promise<void> {
    try {
      const config = await readRateLimit(true)
      await Promise.all([...listeners].map(listener => listener(config)))
    }
    catch (error) {
      options.logger.withError(error).warn('Auth rate-limit reload failed; keeping the last valid config')
    }
  }

  function enqueueReload(): void {
    reloadQueue = reloadQueue.then(reload, reload)
  }

  subscriber.on('message', (channel, message) => {
    if (channel !== CONFIG_KV_INVALIDATION_CHANNEL)
      return

    try {
      const { key } = parseConfigKVInvalidation(message)
      if (key === 'AUTH_RATE_LIMIT_MAX' || key === 'AUTH_RATE_LIMIT_WINDOW_SEC')
        enqueueReload()
    }
    catch (error) {
      options.logger.withError(error).warn('Failed to parse configkv:invalidate payload')
    }
  })
  subscriber.on('ready', enqueueReload)
  subscriber.on('error', (error: Error) => {
    options.logger.withError(error).warn('Auth config subscriber connection error')
  })

  return {
    async getRateLimit(): Promise<AuthRateLimitConfig> {
      return await readRateLimit(false)
    },

    onRateLimitChange(listener: RateLimitChangeListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    onStop(listener: StopListener): () => void {
      stopListeners.add(listener)
      return () => stopListeners.delete(listener)
    },

    async start(): Promise<void> {
      try {
        await subscriber.subscribe(CONFIG_KV_INVALIDATION_CHANNEL)
      }
      catch (error) {
        options.logger.withError(error).warn('Failed to subscribe to configkv:invalidate channel')
      }
    },

    async stop(): Promise<void> {
      listeners.clear()
      await Promise.all([...stopListeners].map(listener => listener()))
      stopListeners.clear()
      await subscriber.quit()
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

type RateLimitRuntimeOptions = Omit<RateLimitOptions, 'max' | 'windowSec'>

function createRateLimitMiddleware(opts: RateLimitOptions, store: MemoryStore<HonoEnv>): MiddlewareHandler<HonoEnv> {
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
    store,
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
 * Rate limiter middleware powered by hono-rate-limiter.
 * Uses in-memory store by default (single-instance).
 */
export function rateLimiter(opts: RateLimitOptions) {
  return createRateLimitMiddleware(opts, new MemoryStore<HonoEnv>())
}

/**
 * Creates a middleware whose complete limit and window can be replaced.
 *
 * Each replacement owns a new MemoryStore, so buckets reset at the switch.
 * Requests that already captured the old middleware can finish normally.
 */
export function createReloadableRateLimiter(initial: AuthRateLimitConfig, options: RateLimitRuntimeOptions) {
  function build(config: AuthRateLimitConfig) {
    const store = new MemoryStore<HonoEnv>()
    return {
      middleware: createRateLimitMiddleware({ ...options, ...config }, store),
      store,
    }
  }

  let active = build(initial)

  return {
    middleware: (async (context, next) => {
      const middleware = active.middleware
      return await middleware(context, next)
    }) satisfies MiddlewareHandler<HonoEnv>,

    async replace(config: AuthRateLimitConfig): Promise<void> {
      const previous = active
      active = build(config)
      await previous.store.shutdown()
    },

    async shutdown(): Promise<void> {
      await active.store.shutdown()
    },
  }
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
