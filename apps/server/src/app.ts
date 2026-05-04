import type Redis from 'ioredis'

import type { AuthInstance } from './libs/auth'
import type { Database } from './libs/db'
import type { Env } from './libs/env'
import type { MqService } from './libs/mq'
import type { OtelInstance } from './libs/otel'
import type { BillingEvent } from './services/billing/billing-events'
import type { BillingService } from './services/billing/billing-service'
import type { FluxMeter } from './services/billing/flux-meter'
import type { CharacterService } from './services/characters'
import type { ChatService } from './services/chats'
import type { ConfigKVService } from './services/config-kv'
import type { FluxService } from './services/flux'
import type { FluxTransactionService } from './services/flux-transaction'
import type { ProviderService } from './services/providers'
import type { StripeService } from './services/stripe'
import type { UserDeletionService } from './services/user-deletion'
import type { HonoEnv } from './types/hono'

import process from 'node:process'

import Stripe from 'stripe'

import { initLogger, LoggerFormat, LoggerLevel, setGlobalHookPostLog, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca, lifecycle } from 'injeca'

import { createAuth, getTrustedClientSeedSummaries, seedTrustedClients } from './libs/auth'
import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { emitOtelLog, initOtel } from './libs/otel'
import { createRedis } from './libs/redis'
import { resolveRequestAuth } from './libs/request-auth'
import { sessionMiddleware } from './middlewares/auth'
import { otelMiddleware } from './middlewares/otel'
import { createAuthRoutes } from './routes/auth'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createV1CompletionsRoutes } from './routes/openai/v1'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createWellKnownRoutes } from './routes/well-known'
import { createBillingMq } from './services/billing/billing-events'
import { createBillingService } from './services/billing/billing-service'
import { createFluxMeter } from './services/billing/flux-meter'
import { createCharacterService } from './services/characters'
import { createChatService } from './services/chats'
import { createConfigKVService } from './services/config-kv'
import { createEmailService } from './services/email'
import { createFluxService } from './services/flux'
import { createFluxTransactionService } from './services/flux-transaction'
import { createProviderService } from './services/providers'
import { createRequestLogService } from './services/request-log'
import { createStripeService } from './services/stripe'
import { createUserDeletionService } from './services/user-deletion'
import { ApiError, createInternalError, createUnauthorizedError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

interface AppDeps {
  auth: AuthInstance
  db: Database
  characterService: CharacterService
  chatService: ChatService
  providerService: ProviderService
  fluxService: FluxService
  fluxTransactionService: FluxTransactionService
  stripeService: StripeService
  billingService: BillingService
  ttsMeter: FluxMeter
  billingMq: MqService<BillingEvent>
  configKV: ConfigKVService
  redis: Redis
  env: Env
  otel: OtelInstance | null
  userDeletionService: UserDeletionService
}

export async function buildApp(deps: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  const app = new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      await next()

      // NOTICE: All API responses should be non-cacheable. Auth responses can
      // carry session state through redirects, and stale API payloads are not
      // safe to serve from edge caches after user/account mutations.
      c.res.headers.set('Cache-Control', 'no-store, no-cache, private, max-age=0')
      c.res.headers.set('Pragma', 'no-cache')
      c.res.headers.set('Expires', '0')
    })
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
    const session = await resolveRequestAuth(
      deps.auth,
      deps.env,
      new Headers({ Authorization: `Bearer ${token}` }),
    )
    if (!session?.user) {
      throw createUnauthorizedError('Invalid token')
    }
    return chatWsSetup(session.user.id)
  }))

  const builtApp = app
    .use('*', sessionMiddleware(deps.auth, deps.env))
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
    .onError((err, c) => {
      if (err instanceof ApiError) {
        if (err.statusCode >= 500) {
          logger.withError(err).error('API error occurred')
        }
        else if (err.statusCode !== 401) {
          logger.withError(err).warn('API error occurred')
        }

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
     * Service identity at the API root. Visitors who land here from a stray
     * email link, search engine, or copy-pasted URL get a clear pointer to
     * the actual product UI instead of the framework's default "404 Not Found".
     */
    .on('GET', '/', c => c.json({
      service: 'airi-api',
      message: 'This is the Project AIRI API server. Visit https://airi.moeru.ai to use the product, or see the docs at https://airi.moeru.ai/docs.',
      docs: 'https://airi.moeru.ai/docs',
      ui: 'https://airi.moeru.ai',
    }))

    /**
     * Auth routes: sign-in page, token auth helpers, electron callback
     * relay, well-known metadata, and better-auth catch-all.
     */
    .route('/', await createAuthRoutes({
      auth: deps.auth,
      db: deps.db,
      env: deps.env,
      configKV: deps.configKV,
    }))
    .route('/.well-known', createWellKnownRoutes({ env: deps.env }))

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
    .route('/api/v1/openai', createV1CompletionsRoutes(deps.fluxService, deps.billingService, deps.configKV, deps.billingMq, deps.ttsMeter, deps.redis, deps.env, deps.otel?.genAi))

    /**
     * Flux routes.
     */
    .route('/api/v1/flux', createFluxRoutes(deps.fluxService, deps.fluxTransactionService))

    /**
     * Stripe routes.
     */
    .route('/api/v1/stripe', createStripeRoutes(deps.fluxService, deps.stripeService, deps.billingService, deps.configKV, deps.env, deps.redis, deps.otel?.revenue))

    /**
     * Catch-all 404 in JSON. Replaces hono's default `text/html` "404 Not
     * Found" so unmatched routes (typos, stale email links, scanners) get a
     * structured response and a hint at where to go for the real product UI.
     */
    .notFound(c => c.json({
      error: 'NOT_FOUND',
      message: `No route matched ${c.req.method} ${new URL(c.req.url).pathname}. This is the airi-api server; the product UI lives at https://airi.moeru.ai.`,
      ui: 'https://airi.moeru.ai',
    }, 404))

  return { app: builtApp, injectWebSocket }
}

export type AppType = Awaited<ReturnType<typeof buildApp>>['app']

export async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))
  const logger = useLogger('app').useGlobalConfig()

  // Forward logg output to OpenTelemetry log exporter
  setGlobalHookPostLog((log) => {
    emitOtelLog(log.level, log.context, log.message, log.fields as Record<string, string | number | boolean>)
  })

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

  const emailService = injeca.provide('services:email', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => createEmailService({
      apiKey: dependsOn.env.RESEND_API_KEY,
      fromEmail: dependsOn.env.RESEND_FROM_EMAIL,
      fromName: dependsOn.env.RESEND_FROM_NAME,
    }),
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
    dependsOn: { db, env: parsedEnv },
    build: ({ dependsOn }) => {
      // Stripe SDK is optional — when STRIPE_SECRET_KEY is unset (dev/CI)
      // billing routes degrade gracefully and the user-deletion pipeline
      // skips the API cancel call.
      const stripe = dependsOn.env.STRIPE_SECRET_KEY ? new Stripe(dependsOn.env.STRIPE_SECRET_KEY) : null
      return createStripeService(dependsOn.db, stripe)
    },
  })

  const fluxTransactionService = injeca.provide('services:fluxTransaction', {
    dependsOn: { db },
    build: ({ dependsOn }) => createFluxTransactionService(dependsOn.db),
  })

  const fluxService = injeca.provide('services:flux', {
    dependsOn: { db, redis, configKV },
    build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.redis, dependsOn.configKV),
  })

  // NOTICE:
  // The deletion service is a thin scheduler that delegates to each business
  // service's own `deleteAllForUser` method. Adding a new business module:
  //   1. give it a `deleteAllForUser(userId)` method
  //   2. add one `service.register(...)` line below
  // Domain knowledge stays inside each service instead of being copied into
  // a parallel handler file. See `apps/server/docs/ai-context/account-deletion.md`.
  const userDeletionService = injeca.provide('services:userDeletion', {
    dependsOn: { stripeService, fluxService, providerService, characterService, chatService },
    build: ({ dependsOn }) => {
      const service = createUserDeletionService()
      // priority: 10 = external side-effects (Stripe API cancel — unrollable),
      //           20 = financial / cache state (Flux balance + Redis),
      //           30 = pure DB soft-delete (no external touch).
      service.register({ name: 'stripe', priority: 10, softDelete: ({ userId }) => dependsOn.stripeService.deleteAllForUser(userId) })
      service.register({ name: 'flux', priority: 20, softDelete: ({ userId }) => dependsOn.fluxService.deleteAllForUser(userId) })
      service.register({ name: 'providers', priority: 30, softDelete: ({ userId }) => dependsOn.providerService.deleteAllForUser(userId) })
      service.register({ name: 'characters', priority: 30, softDelete: ({ userId }) => dependsOn.characterService.deleteAllForUser(userId) })
      service.register({ name: 'chats', priority: 30, softDelete: ({ userId }) => dependsOn.chatService.deleteAllForUser(userId) })
      return service
    },
  })

  const auth = injeca.provide('services:auth', {
    dependsOn: { db, env: parsedEnv, otel, email: emailService, userDeletionService },
    build: async ({ dependsOn }) => {
      // Seed trusted OIDC clients into DB so FK constraints on oauth_access_token are satisfied
      await seedTrustedClients(dependsOn.db, dependsOn.env)
      const trustedClients = getTrustedClientSeedSummaries(dependsOn.env)
      logger.withField('apiServerUrl', dependsOn.env.API_SERVER_URL).log('OIDC startup configuration')
      for (const client of trustedClients) {
        logger.withFields({
          clientId: client.clientId,
          clientName: client.name,
          redirectUris: client.redirectUris.join(', '),
        }).log('OIDC trusted client ready')
      }
      return createAuth(dependsOn.db, dependsOn.env, dependsOn.email, dependsOn.otel?.auth, dependsOn.userDeletionService)
    },
  })

  const requestLogService = injeca.provide('services:requestLog', {
    dependsOn: { db },
    build: ({ dependsOn }) => createRequestLogService(dependsOn.db),
  })

  const billingService = injeca.provide('services:billing', {
    dependsOn: { db, redis, billingMq, configKV, otel },
    build: ({ dependsOn }) => createBillingService(dependsOn.db, dependsOn.redis, dependsOn.billingMq, dependsOn.configKV, dependsOn.otel?.revenue),
  })

  const ttsMeter = injeca.provide('services:ttsMeter', {
    dependsOn: { redis, billingService, configKV },
    build: ({ dependsOn }) => createFluxMeter(dependsOn.redis, dependsOn.billingService, {
      name: 'tts',
      // Lazy config read: missing FLUX_PER_1K_CHARS_TTS surfaces as a
      // per-request 503 (via route-level configGuard), not a server boot
      // failure that would take chat/auth/stripe down with it.
      resolveRuntime: async () => {
        const fluxPer1kChars = await dependsOn.configKV.getOrThrow('FLUX_PER_1K_CHARS_TTS')
        const ttl = await dependsOn.configKV.get('TTS_DEBT_TTL_SECONDS')
        return {
          unitsPerFlux: Math.max(1, Math.floor(1000 / fluxPer1kChars)),
          debtTtlSeconds: ttl,
        }
      },
    }),
  })

  await injeca.start()
  const resolved = await injeca.resolve({
    db,
    auth,
    characterService,
    chatService,
    providerService,
    fluxService,
    fluxTransactionService,
    requestLogService,
    stripeService,
    billingService,
    ttsMeter,
    billingMq,
    configKV,
    redis,
    env: parsedEnv,
    otel,
    userDeletionService,
  })
  const { app, injectWebSocket } = await buildApp({
    auth: resolved.auth,
    db: resolved.db,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    providerService: resolved.providerService,
    fluxService: resolved.fluxService,
    fluxTransactionService: resolved.fluxTransactionService,
    stripeService: resolved.stripeService,
    billingService: resolved.billingService,
    ttsMeter: resolved.ttsMeter,
    billingMq: resolved.billingMq,
    configKV: resolved.configKV,
    redis: resolved.redis,
    env: resolved.env,
    otel: resolved.otel,
    userDeletionService: resolved.userDeletionService,
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
