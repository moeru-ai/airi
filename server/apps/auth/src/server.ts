import type { Logger } from '@guiiai/logg'

import type { AuthInstance } from './auth'
import type { AuthDatabase } from './db'
import type { AuthEnv } from './env'
import type { RateLimitMetrics } from './otel'
import type { HonoEnv } from './routes'

import process from 'node:process'

import Redis from 'ioredis'

import { initLogger, LoggerFormat, LoggerLevel, setGlobalHookPostLog, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { withRetry } from '@moeru/std'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createContainer, createLoggLogger, lifecycle, provide, resolve, start, stop } from 'injeca'

import { createAuth, getTrustedClientSeedSummaries, seedTrustedClients } from './auth'
import { createAuthDrizzle } from './db'
import { createEmailService } from './email'
import { parseAuthEnv } from './env'
import { ApiError, createInternalError } from './error'
import { getTrustedOrigin } from './origin'
import { emitOtelLog, initAuthOtel } from './otel'
import { createResourceApi } from './resource-api'
import { createAuthRoutes } from './routes'

const EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS = 5
const EXTERNAL_DEPENDENCY_INIT_BASE_DELAY_MS = 5000

/** Initializes an Auth dependency using the process startup retry policy. */
async function initializeExternalDependency<T>(
  dependencyName: string,
  logger: Logger,
  initialize: (attempt: number) => Promise<T>,
): Promise<T> {
  let attempt = 0

  return await withRetry(
    async () => {
      attempt += 1
      return await initialize(attempt)
    },
    {
      retry: EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS - 1,
      retryDelay: EXTERNAL_DEPENDENCY_INIT_BASE_DELAY_MS,
      retryDelayFactor: 2,
      retryDelayMax: EXTERNAL_DEPENDENCY_INIT_BASE_DELAY_MS * 2 ** (EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS - 1),
      onError: (error) => {
        logger.withError(error).warn(`${dependencyName} initialization failed on attempt ${attempt}/${EXTERNAL_DEPENDENCY_INIT_MAX_ATTEMPTS}`)
      },
    },
  )()
}

export interface AuthAppDeps {
  auth: AuthInstance
  db: AuthDatabase
  redis: Redis
  env: AuthEnv
  rateLimitMetrics?: RateLimitMetrics | null
}

/** Builds the standalone Auth HTTP surface without constructing its runtime dependencies. */
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
      rateLimitMetrics: deps.rateLimitMetrics,
    }))

  return { app }
}

export type AuthAppType = Awaited<ReturnType<typeof buildAuthApp>>['app']

/**
 * Builds the standalone auth runtime with its own dependency container.
 * Only authentication infrastructure is registered here; business services
 * remain owned by the resource API process.
 */
export async function createAuthServer() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  const logger = useLogger('auth-server').useGlobalConfig()
  const container = createContainer({ logger: createLoggLogger(useLogger('injeca').useGlobalConfig()) })

  setGlobalHookPostLog((log) => {
    emitOtelLog(log.level, log.context, log.message, log.fields as Record<string, string | number | boolean>)
  })

  const env = provide(container, 'env', () => parseAuthEnv(process.env))
  const otel = provide(container, 'libs:otel', {
    dependsOn: { env },
    build: ({ dependsOn }) => initAuthOtel(dependsOn.env),
  })
  const db = provide(container, 'datastore:db', {
    dependsOn: { env, lifecycle },
    build: async ({ dependsOn }) => {
      const connection = await initializeExternalDependency('Database', logger, async (attempt) => {
        const candidate = createAuthDrizzle(dependsOn.env)
        try {
          await candidate.db.execute('SELECT 1')
          logger.log(`Connected to database on attempt ${attempt}`)
          // The API loads the shared migration history during its startup.
          // Auth only checks connectivity and never races migrations.
          return candidate
        }
        catch (error) {
          await candidate.pool.end()
          throw error
        }
      })
      dependsOn.lifecycle.appHooks.onStop(() => connection.pool.end())
      return connection.db
    },
  })
  const redis = provide(container, 'datastore:redis', {
    dependsOn: { env, lifecycle },
    build: async ({ dependsOn }) => {
      const instance = await initializeExternalDependency('Redis', logger, async (attempt) => {
        const candidate = new Redis(dependsOn.env.REDIS_URL, { lazyConnect: true })
        try {
          await candidate.connect()
          logger.log(`Connected to Redis on attempt ${attempt}`)
          return candidate
        }
        catch (error) {
          candidate.disconnect()
          throw error
        }
      })
      dependsOn.lifecycle.appHooks.onStop(async () => {
        await instance.quit()
      })
      return instance
    },
  })
  const email = provide(container, 'services:email', {
    dependsOn: { env, otel },
    build: ({ dependsOn }) => createEmailService({
      apiKey: dependsOn.env.RESEND_API_KEY,
      fromEmail: dependsOn.env.RESEND_FROM_EMAIL,
      fromName: dependsOn.env.RESEND_FROM_NAME,
    }, undefined, dependsOn.otel?.email),
  })
  const resourceApi = provide(container, 'services:resourceApi', {
    dependsOn: { env },
    build: ({ dependsOn }) => createResourceApi(dependsOn.env.RESOURCE_SERVER_URL),
  })
  const auth = provide(container, 'services:auth', {
    dependsOn: { db, env, email, otel, resourceApi },
    build: async ({ dependsOn }) => {
      await seedTrustedClients(dependsOn.db, dependsOn.env)
      for (const client of getTrustedClientSeedSummaries(dependsOn.env)) {
        logger.withFields({
          clientId: client.clientId,
          clientName: client.name,
          redirectUris: client.redirectUris.join(', '),
        }).log('OIDC trusted client ready')
      }
      return createAuth(
        dependsOn.db,
        dependsOn.env,
        dependsOn.email,
        dependsOn.otel?.auth,
        dependsOn.resourceApi,
      )
    },
  })

  await start(container)
  const dependencies = await resolve(container, { auth, db, redis, env, otel })

  const { app } = await buildAuthApp({
    auth: dependencies.auth,
    db: dependencies.db,
    redis: dependencies.redis,
    env: dependencies.env,
    rateLimitMetrics: dependencies.otel?.rateLimit,
  })

  return {
    app,
    hostname: dependencies.env.HOST,
    port: dependencies.env.PORT,
    stop: () => stop(container),
  }
}

function handleProcessError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

/**
 * Starts the dedicated Auth HTTP process and owns its shutdown lifecycle.
 *
 * Call stack:
 *
 * runAuthServer
 *   -> {@link createAuthServer}
 *     -> {@link buildAuthApp}
 *       -> Better Auth / OIDC routes
 */
export async function runAuthServer(): Promise<void> {
  const runtime = await createAuthServer()
  const server = serve({ fetch: runtime.app.fetch, port: runtime.port, hostname: runtime.hostname })

  process.on('uncaughtException', error => handleProcessError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleProcessError(error, 'Unhandled rejection'))

  await new Promise<void>((resolvePromise, reject) => {
    server.once('close', () => resolvePromise())
    server.once('error', error => reject(error))
  }).finally(runtime.stop)
}
