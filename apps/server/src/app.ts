import type Redis from 'ioredis'

import type { Env } from './libs/env'
import type { MqService } from './libs/mq'
import type { OtelInstance } from './libs/otel'
import type { BillingEvent } from './services/billing/billing-events'
import type { BillingService } from './services/billing/billing-service'
import type { CharacterService } from './services/characters'
import type { ChatService } from './services/chats'
import type { ConfigKVService } from './services/config-kv'
import type { FluxService } from './services/flux'
import type { FluxAuditService } from './services/flux-audit'
import type { ProviderService } from './services/providers'
import type { StripeService } from './services/stripe'
import type { HonoEnv } from './types/hono'

import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca, lifecycle } from 'injeca'

import { createAuth } from './libs/auth'
import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { initOtel } from './libs/otel'
import { createRedis } from './libs/redis'
import { sessionMiddleware } from './middlewares/auth'
import { otelMiddleware } from './middlewares/otel'
import { rateLimiter } from './middlewares/rate-limit'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createV1CompletionsRoutes } from './routes/openai/v1'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createBillingMq } from './services/billing/billing-events'
import { createBillingService } from './services/billing/billing-service'
import { createCharacterService } from './services/characters'
import { createChatService } from './services/chats'
import { createConfigKVService } from './services/config-kv'
import { createFluxService } from './services/flux'
import { createFluxAuditService } from './services/flux-audit'
import { createProviderService } from './services/providers'
import { createRequestLogService } from './services/request-log'
import { createStripeService } from './services/stripe'
import { ApiError, createInternalError, createUnauthorizedError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

interface AppDeps {
  auth: ReturnType<typeof createAuth>
  characterService: CharacterService
  chatService: ChatService
  providerService: ProviderService
  fluxService: FluxService
  fluxAuditService: FluxAuditService
  stripeService: StripeService
  billingService: BillingService
  billingMq: MqService<BillingEvent>
  configKV: ConfigKVService
  redis: Redis
  env: Env
  otel: OtelInstance | null
}

function buildApp(deps: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  const app = new Hono<HonoEnv>()
    .use(
      '/api/*',
      cors({
        origin: origin => getTrustedOrigin(origin),
        credentials: true,
      }),
    )
    .use(honoLogger())

  if (deps.otel) {
    app.use('*', otelMiddleware(deps.otel.http))
  }

  // WebSocket setup — must be registered BEFORE bodyLimit middleware
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
  const chatWsSetup = createChatWsHandlers(deps.chatService, deps.redis, deps.otel?.engagement ?? null)

  app.get('/ws/chat', upgradeWebSocket(async (c) => {
    const token = c.req.query('token')
    if (!token) {
      throw createUnauthorizedError('Missing token')
    }
    const session = await deps.auth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    })
    if (!session?.user) {
      throw createUnauthorizedError('Invalid token')
    }
    return chatWsSetup(session.user.id)
  }))

  const builtApp = app
    .use('*', sessionMiddleware(deps.auth))
    .use('*', async (c, next) => {
      // Skip global body limit for ASR transcription route (has its own 25MB limit)
      if (c.req.path === '/api/v1/openai/audio/transcriptions') {
        return next()
      }
      return bodyLimit({ maxSize: 1024 * 1024 })(c, next)
    })
    .onError((err, c) => {
      if (err instanceof ApiError) {
        logger.withError(err).warn('API error occurred')

        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }

      logger.withError(err).error('Unhandled error')
      const internalError = createInternalError()
      return c.json({
        error: internalError.errorCode,
        message: internalError.message,
      }, internalError.statusCode)
    })

    /**
     * Health check route.
     */
    .on('GET', '/health', c => c.json({ status: 'ok' }))

    /**
     * Auth routes are handled by the auth instance directly,
     * Powered by better-auth.
     * Rate limited by IP: 20 requests per minute.
     */
    .use('/api/auth/*', rateLimiter({
      max: 20,
      windowSec: 60,
      keyGenerator: c => c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown',
    }))
    .on(['POST', 'GET'], '/api/auth/*', c => deps.auth.handler(c.req.raw))

    /**
     * Character routes are handled by the character service.
     */
    .route('/api/v1/characters', createCharacterRoutes(deps.characterService))

    /**
     * Provider routes are handled by the provider service.
     */
    .route('/api/v1/providers', createProviderRoutes(deps.providerService))

    /**
     * Chat routes are handled by the chat service.
     */
    .route('/api/v1/chats', createChatRoutes(deps.chatService))

    /**
     * V1 routes for official provider.
     */
    .route('/api/v1/openai', createV1CompletionsRoutes(deps.fluxService, deps.billingService, deps.configKV, deps.billingMq, deps.otel?.llm))

    /**
     * Flux routes.
     */
    .route('/api/v1/flux', createFluxRoutes(deps.fluxService, deps.fluxAuditService))

    /**
     * Stripe routes.
     */
    .route('/api/v1/stripe', createStripeRoutes(deps.fluxService, deps.stripeService, deps.billingService, deps.configKV, deps.env, deps.otel?.revenue))

  return { app: builtApp, injectWebSocket }
}

export type AppType = ReturnType<typeof buildApp>['app']

export async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))
  const logger = useLogger('app').useGlobalConfig()

  const otel = injeca.provide('libs:otel', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: ({ dependsOn }) => {
      const o = initOtel(dependsOn.env)
      if (!o)
        return null

      dependsOn.lifecycle.appHooks.onStop(() => o.shutdown())
      return o
    },
  })

  const db = injeca.provide('datastore:db', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: async ({ dependsOn }) => {
      const { db: dbInstance, pool } = await initializeExternalDependency(
        'Database',
        logger,
        async (attempt) => {
          const connection = createDrizzle(dependsOn.env)

          try {
            await connection.db.execute('SELECT 1')
            logger.log(`Connected to database on attempt ${attempt}`)
            await migrateDatabase(connection.db)
            logger.log(`Applied schema on attempt ${attempt}`)
            return connection
          }
          catch (error) {
            await connection.pool.end()
            throw error
          }
        },
      )

      dependsOn.lifecycle.appHooks.onStop(() => pool.end())
      return dbInstance
    },
  })

  const redis = injeca.provide('datastore:redis', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: async ({ dependsOn }) => {
      const redisInstance = await initializeExternalDependency(
        'Redis',
        logger,
        async (attempt) => {
          const instance = createRedis(dependsOn.env.REDIS_URL)

          try {
            await instance.connect()
            logger.log(`Connected to Redis on attempt ${attempt}`)
            return instance
          }
          catch (error) {
            instance.disconnect()
            throw error
          }
        },
      )

      dependsOn.lifecycle.appHooks.onStop(async () => {
        await redisInstance.quit()
      })
      return redisInstance
    },
  })

  const configKV = injeca.provide('datastore:configKV', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConfigKVService(dependsOn.redis),
  })

  const billingMq = injeca.provide('services:billingMq', {
    dependsOn: { redis, env: parsedEnv },
    build: ({ dependsOn }) => createBillingMq(dependsOn.redis, {
      stream: dependsOn.env.BILLING_EVENTS_STREAM,
    }),
  })

  const auth = injeca.provide('services:auth', {
    dependsOn: { db, env: parsedEnv, otel },
    build: ({ dependsOn }) => createAuth(dependsOn.db, dependsOn.env, dependsOn.otel?.auth),
  })

  const characterService = injeca.provide('services:characters', {
    dependsOn: { db, otel },
    build: ({ dependsOn }) => createCharacterService(dependsOn.db, dependsOn.otel?.engagement),
  })

  const providerService = injeca.provide('services:providers', {
    dependsOn: { db },
    build: ({ dependsOn }) => createProviderService(dependsOn.db),
  })

  const chatService = injeca.provide('services:chats', {
    dependsOn: { db, otel },
    build: ({ dependsOn }) => createChatService(dependsOn.db, dependsOn.otel?.engagement),
  })

  const stripeService = injeca.provide('services:stripe', {
    dependsOn: { db },
    build: ({ dependsOn }) => createStripeService(dependsOn.db),
  })

  const fluxAuditService = injeca.provide('services:fluxAudit', {
    dependsOn: { db },
    build: ({ dependsOn }) => createFluxAuditService(dependsOn.db),
  })

  const fluxService = injeca.provide('services:flux', {
    dependsOn: { db, redis, configKV },
    build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.redis, dependsOn.configKV),
  })

  const requestLogService = injeca.provide('services:requestLog', {
    dependsOn: { db },
    build: ({ dependsOn }) => createRequestLogService(dependsOn.db),
  })

  const billingService = injeca.provide('services:billing', {
    dependsOn: { db, redis, billingMq, configKV, otel },
    build: ({ dependsOn }) => createBillingService(dependsOn.db, dependsOn.redis, dependsOn.billingMq, dependsOn.configKV, dependsOn.otel?.revenue),
  })

  await injeca.start()
  const resolved = await injeca.resolve({
    db,
    auth,
    characterService,
    chatService,
    providerService,
    fluxService,
    fluxAuditService,
    requestLogService,
    stripeService,
    billingService,
    billingMq,
    configKV,
    redis,
    env: parsedEnv,
    otel,
  })
  const { app, injectWebSocket } = buildApp({
    auth: resolved.auth,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    providerService: resolved.providerService,
    fluxService: resolved.fluxService,
    fluxAuditService: resolved.fluxAuditService,
    stripeService: resolved.stripeService,
    billingService: resolved.billingService,
    billingMq: resolved.billingMq,
    configKV: resolved.configKV,
    redis: resolved.redis,
    env: resolved.env,
    otel: resolved.otel,
  })

  logger.withFields({ hostname: resolved.env.HOST, port: resolved.env.PORT }).log('Server started')

  return {
    app,
    injectWebSocket,
    port: resolved.env.PORT,
    hostname: resolved.env.HOST,
  }
}

function handleProcessError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

export async function runApiServer(): Promise<void> {
  const { app: honoApp, injectWebSocket, port, hostname } = await createApp()
  const server = serve({ fetch: honoApp.fetch, port, hostname })
  injectWebSocket(server)

  process.on('uncaughtException', error => handleProcessError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleProcessError(error, 'Unhandled rejection'))

  await new Promise<void>((resolve, reject) => {
    server.once('close', () => resolve())
    server.once('error', error => reject(error))
  })
}
