import type Redis from 'ioredis'

import type { AuthInstance } from './libs/auth'
import type { AuthDatabase } from './libs/db'
import type { AuthEnv } from './libs/env'
import type { RateLimitMetrics } from './otel'
import type { AuthConfigService } from './services/adapters/auth-config'
import type { HonoEnv } from './types/hono'

import { useLogger } from '@guiiai/logg'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'

import { createAuthRoutes } from './routes/auth'
import { ApiError, createInternalError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

export interface AuthAppDeps {
  auth: AuthInstance
  db: AuthDatabase
  redis: Redis
  env: AuthEnv
  authConfig: AuthConfigService
  rateLimitMetrics?: RateLimitMetrics | null
}

/**
 * Builds the standalone Auth Service HTTP surface.
 *
 * The Auth runtime owns Better Auth and its HTTP routes. It shares the
 * identity database and Redis infrastructure, but does not construct API
 * business modules; account deletion crosses the explicit internal API port.
 */
export async function buildAuthApp(deps: AuthAppDeps) {
  const logger = useLogger('auth-app').useGlobalConfig()

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
          logger.withError(err).withFields(logFields).error('Auth API error occurred')
        else if (err.statusCode !== 401)
          logger.withError(err).withFields(logFields).warn('Auth API error occurred')

        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }

      logger.withError(err).error('Unhandled auth error')
      const internalError = createInternalError()
      return c.json({
        error: internalError.errorCode,
        message: internalError.message,
      }, internalError.statusCode)
    })
    .get('/livez', c => c.json({ status: 'live' }))
    .get('/readyz', async (c) => {
      const [dbResult, redisResult] = await Promise.allSettled([
        // Auth does not run migrations. Probe an owned table so readiness
        // stays false until the migration owner has installed the auth schema.
        deps.db.execute('SELECT 1 FROM "user" LIMIT 1'),
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
      service: 'airi-auth',
      issuer: `${deps.env.PUBLIC_URL}/api/auth`,
      accounts: deps.env.AUTH_UI_URL,
    }))
    .route('/', await createAuthRoutes({
      auth: deps.auth,
      db: deps.db,
      env: deps.env,
      authConfig: deps.authConfig,
      rateLimitMetrics: deps.rateLimitMetrics,
    }))

  return { app }
}

export type AuthAppType = Awaited<ReturnType<typeof buildAuthApp>>['app']
