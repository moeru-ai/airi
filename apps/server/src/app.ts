import type Redis from 'ioredis'
import type { PostHog } from 'posthog-node'

import type { AuthInstance } from './libs/auth'
import type { Database } from './libs/db'
import type { Env } from './libs/env'
import type { OtelInstance } from './otel'
import type { ConfigKVService } from './services/adapters/config-kv'
import type { AdminFluxGrantsService } from './services/domain/admin/flux-grants'
import type { AdminRouterConfigService } from './services/domain/admin/router-config'
import type { BillingService } from './services/domain/billing/billing-service'
import type { FluxMeter } from './services/domain/billing/flux-meter'
import type { CharacterService } from './services/domain/characters'
import type { ChatService } from './services/domain/chats'
import type { FluxService } from './services/domain/flux'
import type { FluxTransactionService } from './services/domain/flux-transaction'
import type { LlmRouterService } from './services/domain/llm-router'
import type { ProviderService } from './services/domain/providers'
import type { RequestLogService } from './services/domain/request-log'
import type { StripeService } from './services/domain/stripe'
import type { UserDeletionService } from './services/domain/user-deletion'
import type { HonoEnv } from './types/hono'
import type { EnvelopeCrypto } from './utils/envelope-crypto'

import process from 'node:process'

import Stripe from 'stripe'

import { initLogger, LoggerFormat, LoggerLevel, setGlobalHookPostLog, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { httpInstrumentationMiddleware } from '@hono/otel'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca, lifecycle } from 'injeca'

import { createAuth, getTrustedClientSeedSummaries, seedTrustedClients } from './libs/auth'
import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { createRedis } from './libs/redis'
import { resolveRequestAuth } from './libs/request-auth'
import { createUnauthorizedWsEvents } from './libs/ws-auth'
import { sessionMiddleware } from './middlewares/auth'
import { emitOtelLog, initOtel } from './otel'
import { registerActiveSessionsGauge } from './otel/gauges/active-sessions'
import { registerDistinctActiveUsersGauge } from './otel/gauges/distinct-active-users'
import { createAdminRouterConfigRoutes } from './routes/admin/config/router'
import { createAdminFluxGrantsRoutes } from './routes/admin/flux-grants'
import { createAudioSpeechWsHandlers } from './routes/audio-speech-ws'
import { createAuthRoutes } from './routes/auth'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createV1Routes } from './routes/openai/v1'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createConfigKVService } from './services/adapters/config-kv'
import { createEmailService } from './services/adapters/email'
import { createPostHogClient } from './services/adapters/posthog'
import { createAdminFluxGrantsService } from './services/domain/admin/flux-grants'
import { createAdminRouterConfigService } from './services/domain/admin/router-config'
import { createBillingService } from './services/domain/billing/billing-service'
import { createFluxMeter } from './services/domain/billing/flux-meter'
import { createCharacterService } from './services/domain/characters'
import { createChatService } from './services/domain/chats'
import { createFluxService } from './services/domain/flux'
import { createFluxTransactionService } from './services/domain/flux-transaction'
import { createConfigSyncSubscriber, createLlmRouterService } from './services/domain/llm-router'
import { createProviderService } from './services/domain/providers'
import { createRequestLogService } from './services/domain/request-log'
import { createStripeService } from './services/domain/stripe'
import { createUserDeletionService } from './services/domain/user-deletion'
import { createEnvelopeCrypto } from './utils/envelope-crypto'
import { ApiError, createInternalError } from './utils/error'
import { nanoid } from './utils/id'
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
  adminFluxGrantsService: AdminFluxGrantsService
  adminRouterConfigService: AdminRouterConfigService
  ttsMeter: FluxMeter
  requestLogService: RequestLogService
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  redis: Redis
  env: Env
  otel: OtelInstance | null
  userDeletionService: UserDeletionService
  llmRouter: LlmRouterService
  posthog: PostHog | null
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
        origin: origin => getTrustedOrigin(origin, deps.env.ADDITIONAL_TRUSTED_ORIGINS),
        credentials: true,
      }),
    )
    .use(honoLogger())

  if (deps.otel) {
    // @hono/otel records `http.server.request.duration` and
    // `http.server.active_requests` with the matched Hono route pattern
    // (auto-instrumentation can't see Hono's router, so it would emit empty
    // `http.route` and concrete URLs, the previous Latency-by-Route bug).
    //
    // K8s-style probes are high-frequency and zero-signal for product
    // metrics; skip outright so they don't pollute http.* dashboards.
    const otelMw = httpInstrumentationMiddleware({
      serviceName: deps.env.OTEL_SERVICE_NAME,
      serviceVersion: process.env.npm_package_version || '0.0.0',
    })
    app.use('*', async (c, next) => {
      if (c.req.path === '/livez' || c.req.path === '/readyz')
        return next()
      return otelMw(c, next)
    })
  }

  // WebSocket setup — must be registered BEFORE bodyLimit middleware
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
  // Per-process stable id used by the chat-ws sub callback to skip echoes of
  // its own publishes. Falls back to a random nanoid when ops do not provide
  // SERVER_INSTANCE_ID, which is fine because we only need uniqueness across
  // simultaneously-running api instances, not across restarts.
  const instanceId = process.env.SERVER_INSTANCE_ID || nanoid()
  const chatWsSetup = createChatWsHandlers(deps.chatService, deps.redis, instanceId, deps.otel?.engagement ?? null)

  app.get('/ws/chat', upgradeWebSocket(async (c) => {
    const token = c.req.query('token')
    if (!token)
      return createUnauthorizedWsEvents()

    const session = await resolveRequestAuth(
      deps.auth,
      deps.env,
      new Headers({ Authorization: `Bearer ${token}` }),
    )
    if (!session?.user)
      return createUnauthorizedWsEvents()

    return chatWsSetup(session.user.id)
  }))

  // Bidirectional streaming TTS proxy. The handler factory builds one ws-to-ws
  // bridge per connection: client ↔ apps/server ↔ unspeech ↔ upstream
  // (Volcengine bidirection etc.). Auth via ?token= mirrors /ws/chat —
  // browsers can't set Authorization headers on WebSocket constructors.
  const audioSpeechWsSetup = createAudioSpeechWsHandlers({
    configKV: deps.configKV,
    envelopeCrypto: deps.envelopeCrypto,
    fluxService: deps.fluxService,
    ttsMeter: deps.ttsMeter,
    requestLogService: deps.requestLogService,
  })
  app.get('/api/v1/audio/speech/ws', upgradeWebSocket(async (c) => {
    const token = c.req.query('token')
    if (!token)
      return createUnauthorizedWsEvents()

    const session = await resolveRequestAuth(
      deps.auth,
      deps.env,
      new Headers({ Authorization: `Bearer ${token}` }),
    )
    if (!session?.user)
      return createUnauthorizedWsEvents()

    return audioSpeechWsSetup(session.user.id)
  }))

  // Cross-instance config invalidation. The subscriber owns its own
  // connection + lifecycle metrics; see services/llm-router/config-sync-subscriber.ts.
  createConfigSyncSubscriber({
    redis: deps.redis,
    llmRouter: deps.llmRouter,
    gatewayMetrics: deps.otel?.gateway ?? null,
    instanceId: deps.env.OTEL_SERVICE_NAME,
    logger: useLogger('config-sync').useGlobalConfig(),
  })

  // Built once so the OpenAI-compat and audio routers share the same closure
  // (helpers like recordMetrics / recordRequestLog cross both surfaces) but
  // mount at different prefixes — see the `.route` calls below.
  const v1Routes = createV1Routes(deps.fluxService, deps.billingService, deps.configKV, deps.requestLogService, deps.ttsMeter, deps.llmRouter, deps.otel?.genAi, deps.otel?.revenue, deps.otel?.rateLimit)

  const builtApp = app
    .use('*', sessionMiddleware(deps.auth, deps.env))
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
    .onError((err, c) => {
      if (err instanceof ApiError) {
        // Surface details + cause to the server-side log only. SEC-5 keeps
        // upstream body content (carried by `cause`) out of the client
        // response body; the logger / OTel pipeline is the right channel
        // for operators to see the real upstream message.
        const logFields = { details: err.details, cause: (err as { cause?: unknown }).cause }

        if (err.statusCode >= 500) {
          logger.withError(err).withFields(logFields).error('API error occurred')
        }
        else if (err.statusCode !== 401) {
          logger.withError(err).withFields(logFields).warn('API error occurred')
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
     * Liveness probe (K8s convention). Returns 200 as long as the Node
     * process is alive. Must not touch Postgres, Redis, or any external
     * dependency: a single upstream blip should NOT cause Railway to
     * recycle the pod (R13/R14).
     */
    .on('GET', '/livez', c => c.json({ status: 'live' }))
    /**
     * Readiness probe (K8s convention). Verifies the instance can serve
     * traffic by pinging Postgres + Redis (the only two infra dependencies
     * that, if down, mean we genuinely can't serve). Gateway-internal key
     * health is intentionally NOT checked (R14): one bad upstream key
     * must not pull the whole instance out of the load balancer pool.
     */
    .on('GET', '/readyz', async (c) => {
      // Run both checks in parallel and let either fail independently.
      const [dbResult, redisResult] = await Promise.allSettled([
        deps.db.execute('SELECT 1'),
        deps.redis.ping(),
      ])

      const dbReady = dbResult.status === 'fulfilled'
      const redisReady = redisResult.status === 'fulfilled'
      const ready = dbReady && redisReady

      return c.json(
        {
          status: ready ? 'ready' : 'not_ready',
          checks: { db: dbReady ? 'ok' : 'fail', redis: redisReady ? 'ok' : 'fail' },
        },
        ready ? 200 : 503,
      )
    })

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
      rateLimitMetrics: deps.otel?.rateLimit,
    }))

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
     * V1 OpenAI-compatible and audio routes. The factory returns two
     * sibling routers because the audio surface deliberately lives outside
     * `/openai/` — its `/voices`, `/voices/streaming`, and `/models`
     * extensions aren't OpenAI public APIs.
     */
    .route('/api/v1/openai', v1Routes.openaiRoutes)
    .route('/api/v1/audio', v1Routes.audioRoutes)

    /**
     * Flux routes.
     */
    .route('/api/v1/flux', createFluxRoutes(deps.fluxService, deps.fluxTransactionService))

    /**
     * Stripe routes.
     */
    .route('/api/v1/stripe', createStripeRoutes(deps.fluxService, deps.stripeService, deps.billingService, deps.configKV, deps.env, deps.redis, deps.otel?.revenue, deps.otel?.rateLimit, deps.posthog))

    /**
     * Admin routes — guarded by `ADMIN_EMAILS` allowlist + verified email.
     * v1 only includes synchronous one-shot promo flux grants.
     */
    .route('/api/admin/flux-grants', createAdminFluxGrantsRoutes(deps.adminFluxGrantsService, deps.env))

    /**
     * Admin LLM router config seeding/patching. Single entry point for
     * writing `LLM_ROUTER_CONFIG`, `UNSPEECH_UPSTREAM`, and the
     * `DEFAULT_{CHAT,TTS}_MODEL` aliases — see
     * `routes/admin/config/router/index.ts` for the body shape.
     */
    .route('/api/admin/config/router', createAdminRouterConfigRoutes(deps.adminRouterConfigService, deps.env))

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

  // NOTICE: OTel SDK lifecycle (start/shutdown) is owned entirely by
  // instrumentation.ts (preload). This factory only consumes the global
  // MeterProvider that the preload set up, builds metric handles, and primes
  // counters. No `lifecycle.onStop(shutdown)` here — preload registers SIGTERM
  // / SIGINT to flush exporters on its own.
  const otel = injeca.provide('libs:otel', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => initOtel(dependsOn.env),
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

  const emailService = injeca.provide('services:email', {
    dependsOn: { env: parsedEnv, otel },
    build: ({ dependsOn }) => createEmailService({
      apiKey: dependsOn.env.RESEND_API_KEY,
      fromEmail: dependsOn.env.RESEND_FROM_EMAIL,
      fromName: dependsOn.env.RESEND_FROM_NAME,
    }, undefined, dependsOn.otel?.email),
  })

  // Webhook capture path goes through `captureSafe` → `captureImmediate`,
  // which awaits the HTTP send inline, so individual events never sit in
  // the background queue. `flush()` + `_shutdown()` on SIGTERM is the belt-
  // and-suspenders drain for any future call site that uses the regular
  // `capture()` (which only enqueues).
  //
  // NOTICE:
  // We use the underscore-prefixed `_shutdown` despite its "internal" naming
  // because the public `shutdown(timeoutMs)` returns void (`types.d.ts:580`)
  // — there is no way to await its completion. `_shutdown(timeoutMs)` returns
  // `Promise<void>` (`client.d.ts:934`) and is the only way to ensure the
  // process doesn't exit while PostHog cleanup is still running. Posthog's
  // own examples show `await client._shutdown()` as the recommended pattern.
  const posthog = injeca.provide('services:posthog', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: ({ dependsOn }) => {
      const client = createPostHogClient(dependsOn.env)
      if (client) {
        dependsOn.lifecycle.appHooks.onStop(async () => {
          try {
            await client.flush()
          }
          catch {
            // Flush failures on shutdown are non-fatal; we lose at most a
            // few queued events. Fall through to shutdown anyway.
          }
          try {
            await client._shutdown(5000)
          }
          catch {
            // Shutdown errors are also non-fatal during process exit.
          }
        })
      }
      return client
    },
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
    dependsOn: { db, env: parsedEnv, otel, email: emailService, userDeletionService, posthog },
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
      return createAuth(dependsOn.db, dependsOn.env, dependsOn.email, dependsOn.otel?.auth, dependsOn.userDeletionService, dependsOn.posthog)
    },
  })

  const requestLogService = injeca.provide('services:requestLog', {
    dependsOn: { db },
    build: ({ dependsOn }) => createRequestLogService(dependsOn.db),
  })

  const billingService = injeca.provide('services:billing', {
    dependsOn: { db, redis, configKV, otel },
    build: ({ dependsOn }) => createBillingService(dependsOn.db, dependsOn.redis, dependsOn.configKV, dependsOn.otel?.revenue),
  })

  const adminFluxGrantsService = injeca.provide('services:adminFluxGrants', {
    dependsOn: { db, billingService },
    build: ({ dependsOn }) => createAdminFluxGrantsService({
      db: dependsOn.db,
      billingService: dependsOn.billingService,
    }),
  })

  const ttsMeter = injeca.provide('services:ttsMeter', {
    dependsOn: { redis, billingService, configKV, otel },
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
    }, dependsOn.otel?.revenue),
  })

  // Envelope crypto for at-rest upstream key decryption. Shared by the LLM
  // router (HTTP chat / TTS) and the audio-speech-ws proxy (streaming TTS)
  // so a single master-key change rotates every surface at once.
  const envelopeCrypto = injeca.provide('libs:envelopeCrypto', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => createEnvelopeCrypto({
      masterKey: dependsOn.env.LLM_ROUTER_MASTER_KEY,
      previousMasterKey: dependsOn.env.LLM_ROUTER_MASTER_KEY_PREVIOUS,
    }),
  })

  // Admin router-config seeding service. Reuses the shared envelope crypto
  // so written ciphertexts decrypt cleanly under the same master key the
  // gateway already uses. Mounted at POST /api/admin/config/router.
  const adminRouterConfigService = injeca.provide('services:adminRouterConfig', {
    dependsOn: { configKV, envelopeCrypto, redis },
    build: ({ dependsOn }) => createAdminRouterConfigService({
      configKV: dependsOn.configKV,
      envelope: dependsOn.envelopeCrypto,
      redis: dependsOn.redis,
    }),
  })

  // LLM router (KTD-5 in-process replacement for the knoway sidecar).
  // LLM_ROUTER_MASTER_KEY is required at env-parse time, so this provider
  // always builds a real router — the legacy `null` fallback path is gone.
  const llmRouter = injeca.provide('services:llmRouter', {
    dependsOn: { configKV, envelopeCrypto, otel, redis },
    build: ({ dependsOn }) => createLlmRouterService({
      configKV: dependsOn.configKV,
      envelopeCrypto: dependsOn.envelopeCrypto,
      gatewayMetrics: dependsOn.otel?.gateway ?? null,
      redis: dependsOn.redis,
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
    adminFluxGrantsService,
    adminRouterConfigService,
    ttsMeter,
    configKV,
    envelopeCrypto,
    redis,
    env: parsedEnv,
    otel,
    userDeletionService,
    llmRouter,
    posthog,
  })
  // Register the cluster-wide ObservableGauges for sessions / users. Each
  // replica polls the same DB (cached 10s, in-flight coalesced); dashboards
  // aggregate with avg(), not sum(). See observability-conventions.md.
  //
  // Both gauges share the same `session` table: `user.active_sessions` is
  // `COUNT(*)` (row inflation prone), `user.distinct_active` is
  // `COUNT(DISTINCT user_id)` (real active-user count). Comparing the two
  // surfaces session-row leakage from missing GC + per-OIDC-token row
  // creation.
  if (resolved.otel) {
    registerActiveSessionsGauge(resolved.otel.auth.activeSessions, resolved.db, resolved.otel.observability.metricReadErrors)
    registerDistinctActiveUsersGauge(resolved.otel.auth.distinctActiveUsers, resolved.db, resolved.otel.observability.metricReadErrors)
  }

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
    adminFluxGrantsService: resolved.adminFluxGrantsService,
    adminRouterConfigService: resolved.adminRouterConfigService,
    ttsMeter: resolved.ttsMeter,
    requestLogService: resolved.requestLogService,
    configKV: resolved.configKV,
    envelopeCrypto: resolved.envelopeCrypto,
    redis: resolved.redis,
    env: resolved.env,
    otel: resolved.otel,
    userDeletionService: resolved.userDeletionService,
    llmRouter: resolved.llmRouter,
    posthog: resolved.posthog,
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
