import type Redis from 'ioredis'

import type { AuthInstance } from './libs/auth'
import type { Database } from './libs/db'
import type { IdentityEnv } from './libs/env'
import type { RateLimitMetrics } from './otel'
import type { ConfigKVService } from './services/adapters/config-kv'
import type { HonoEnv } from './types/hono'

import { useLogger } from '@guiiai/logg'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'

import { createAuthRoutes } from './routes/auth'
import { ApiError, createInternalError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

export interface IdentityAppDeps {
  auth: AuthInstance
  db: Database
  redis: Redis
  env: IdentityEnv
  configKV: ConfigKVService
  rateLimitMetrics?: RateLimitMetrics | null
}

/**
 * Builds the standalone Identity Service HTTP surface.
 *
 * The Identity runtime owns Better Auth and its HTTP routes. It shares the
 * identity database and Redis infrastructure, but does not construct API
 * business modules; account deletion crosses the explicit internal API port.
 */
export async function buildIdentityApp(deps: IdentityAppDeps) {
  const logger = useLogger('identity-app').useGlobalConfig()

  const app = new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      await next()
      c.res.headers.set('Cache-Control', 'no-store, no-cache, private, max-age=0')
      c.res.headers.set('Pragma', 'no-cache')
      c.res.headers.set('Expires', '0')
    })
    .use(
      '/api/*',
      cors({
        origin: origin => getTrustedOrigin(origin, deps.env.ADDITIONAL_TRUSTED_ORIGINS),
        credentials: true,
      }),
    )
    .use(honoLogger())
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
    .onError((err, c) => {
      if (err instanceof ApiError) {
        const logFields = { details: err.details, cause: (err as { cause?: unknown }).cause }
        if (err.statusCode >= 500)
          logger.withError(err).withFields(logFields).error('Identity API error occurred')
        else if (err.statusCode !== 401)
          logger.withError(err).withFields(logFields).warn('Identity API error occurred')

        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }

      logger.withError(err).error('Unhandled identity error')
      const internalError = createInternalError()
      return c.json({
        error: internalError.errorCode,
        message: internalError.message,
      }, internalError.statusCode)
    })
    .get('/livez', c => c.json({ status: 'live' }))
    .get('/readyz', async (c) => {
      const [dbResult, redisResult] = await Promise.allSettled([
        deps.db.execute('SELECT 1'),
        deps.redis.ping(),
      ])
      const dbReady = dbResult.status === 'fulfilled'
      const redisReady = redisResult.status === 'fulfilled'
      const ready = dbReady && redisReady

      return c.json({
        status: ready ? 'ready' : 'not_ready',
        checks: { db: dbReady ? 'ok' : 'fail', redis: redisReady ? 'ok' : 'fail' },
      }, ready ? 200 : 503)
    })
    .get('/', c => c.json({
      service: 'airi-identity',
      issuer: `${deps.env.API_SERVER_URL}/api/auth`,
      accounts: deps.env.AUTH_UI_URL,
    }))
    .route('/', await createAuthRoutes({
      auth: deps.auth,
      db: deps.db,
      env: deps.env,
      configKV: deps.configKV,
      rateLimitMetrics: deps.rateLimitMetrics,
    }))

  return { app }
}

export type IdentityAppType = Awaited<ReturnType<typeof buildIdentityApp>>['app']
