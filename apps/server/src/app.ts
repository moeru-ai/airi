import type Redis from 'ioredis'

import type { Env } from './libs/env'
import type { OtelInstance } from './libs/otel'
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
import { initOtel } from './libs/otel'
import { createRedis } from './libs/redis'
import { sessionMiddleware } from './middlewares/auth'
import { otelMiddleware } from './middlewares/otel'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createV1CompletionsRoutes } from './routes/v1completions'
import { createBillingService } from './services/billing-service'
import { createCharacterService } from './services/characters'
import { createChatService } from './services/chats'
import { createConfigKVService } from './services/config-kv'
import { createFluxService } from './services/flux'
import { createFluxAuditService } from './services/flux-audit'
import { createOutboxService } from './services/outbox-service'
import { createProviderService } from './services/providers'
import { createRequestLogService } from './services/request-log'
import { createStripeService } from './services/stripe'
import { ApiError, createInternalError, createUnauthorizedError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

type AuthService = ReturnType<typeof createAuth>
type CharacterService = ReturnType<typeof createCharacterService>
type ChatService = ReturnType<typeof createChatService>
type ProviderService = ReturnType<typeof createProviderService>
type FluxService = ReturnType<typeof createFluxService>
type ConfigKVService = ReturnType<typeof createConfigKVService>
type RequestLogService = ReturnType<typeof createRequestLogService>
type StripeDBService = ReturnType<typeof createStripeService>
type FluxAuditService = ReturnType<typeof createFluxAuditService>
type BillingService = ReturnType<typeof createBillingService>

interface AppDeps {
  auth: AuthService
  characterService: CharacterService
  chatService: ChatService
  providerService: ProviderService
  fluxService: FluxService
  fluxAuditService: FluxAuditService
  requestLogService: RequestLogService
  stripeService: StripeDBService
  billingService: BillingService
  configKV: ConfigKVService
  redis: Redis
  env: Env
  otel: OtelInstance | null
}

function buildApp({
  auth,
  characterService,
  chatService,
  providerService,
  fluxService,
  fluxAuditService,
  requestLogService,
  stripeService,
  billingService,
  configKV,
  redis,
  env,
  otel,
}: AppDeps) {
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

  if (otel) {
    app.use('*', otelMiddleware(otel.http))
  }

  // WebSocket setup — must be registered BEFORE bodyLimit middleware
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
  const chatWsSetup = createChatWsHandlers(chatService, redis, otel?.engagement ?? null)

  app.get('/ws/chat', upgradeWebSocket(async (c) => {
    const token = c.req.query('token')
    if (!token) {
      throw createUnauthorizedError('Missing token')
    }
    const session = await auth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
    })
    if (!session?.user) {
      throw createUnauthorizedError('Invalid token')
    }
    return chatWsSetup(session.user.id)
  }))

  const builtApp = app
    .use('*', sessionMiddleware(auth))
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
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
     */
    .on(['POST', 'GET'], '/api/auth/*', c => auth.handler(c.req.raw))

    /**
     * Character routes are handled by the character service.
     */
    .route('/api/characters', createCharacterRoutes(characterService))

    /**
     * Provider routes are handled by the provider service.
     */
    .route('/api/providers', createProviderRoutes(providerService))

    /**
     * Chat routes are handled by the chat service.
     */
    .route('/api/chats', createChatRoutes(chatService))

    /**
     * V1 routes for official provider.
     */
    .route('/api/v1', createV1CompletionsRoutes(fluxService, billingService, configKV, requestLogService, otel?.llm ?? null))

    /**
     * Flux routes.
     */
    .route('/api/flux', createFluxRoutes(fluxService, fluxAuditService))

    /**
     * Stripe routes.
     */
    .route('/api/stripe', createStripeRoutes(fluxService, stripeService, billingService, configKV, env, otel?.revenue))

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
      const { db: dbInstance, pool } = createDrizzle(dependsOn.env.DATABASE_URL)
      await dbInstance.execute('SELECT 1')
      logger.log('Connected to database')
      await migrateDatabase(dbInstance)
      logger.log('Applied schema')

      dependsOn.lifecycle.appHooks.onStop(() => pool.end())
      return dbInstance
    },
  })

  const redis = injeca.provide('datastore:redis', {
    dependsOn: { env: parsedEnv },
    build: async ({ dependsOn }) => {
      const redisInstance = createRedis(dependsOn.env.REDIS_URL)
      await redisInstance.connect()
      logger.log('Connected to Redis')
      return redisInstance
    },
  })

  const configKV = injeca.provide('datastore:configKV', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConfigKVService(dependsOn.redis),
  })

  const outboxService = injeca.provide('services:outbox', {
    dependsOn: { db },
    build: ({ dependsOn }) => createOutboxService(dependsOn.db),
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
    dependsOn: { db, redis, outboxService, configKV, otel },
    build: ({ dependsOn }) => createBillingService(dependsOn.db, dependsOn.redis, dependsOn.outboxService, dependsOn.configKV, dependsOn.otel?.revenue),
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
    requestLogService: resolved.requestLogService,
    stripeService: resolved.stripeService,
    billingService: resolved.billingService,
    configKV: resolved.configKV,
    redis: resolved.redis,
    env: resolved.env,
    otel: resolved.otel,
  })

  logger.withFields({ hostname: resolved.env.HOST, port: resolved.env.PORT }).log('Server started')

  return {
    app,
    injectWebSocket,
    port: Number(resolved.env.PORT),
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
