import type Redis from 'ioredis'

import type { AuthInstance } from './libs/auth'
import type { Database } from './libs/db'
import type { Env } from './libs/env'
import type { OtelInstance } from './otel'
import type { StreamingTtsVoiceType } from './routes/audio-speech-ws/session'
import type { ConfigKVService } from './services/adapters/config-kv'
import type { AdminFluxGrantsService } from './services/domain/admin/flux-grants'
import type { AdminRouterConfigService } from './services/domain/admin/router-config'
import type { AdminUsersService } from './services/domain/admin/users'
import type { BillingService } from './services/domain/billing/billing-service'
import type { FluxMeter } from './services/domain/billing/flux-meter'
import type { CharacterService } from './services/domain/characters'
import type { ChatService } from './services/domain/chats'
import type { FluxService } from './services/domain/flux'
import type { FluxTransactionService } from './services/domain/flux-transaction'
import type { LlmRouterService } from './services/domain/llm-router'
import type { ProductEventService } from './services/domain/product-events'
import type { ProviderCatalogService } from './services/domain/provider-catalog'
import type { ProviderService } from './services/domain/providers'
import type { RequestLogService } from './services/domain/request-log'
import type { StripeService } from './services/domain/stripe'
import type { UserDeletionService } from './services/domain/user-deletion'
import type { VoicePackService } from './services/domain/voice-packs'
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
import { registerRollingActiveUsersGauge } from './otel/gauges/rolling-active-users'
import { registerTotalUsersGauge } from './otel/gauges/total-users'
import { registerTtsPoolGauge } from './otel/gauges/tts-pool'
import { createAdminRoutes } from './routes/admin'
import { createAdminUiRoutes } from './routes/admin-ui'
import { createAdminCapabilityAliasRoutes } from './routes/admin/capability-aliases'
import { createAdminRouterConfigRoutes } from './routes/admin/config/router'
import { createAdminFluxGrantsRoutes } from './routes/admin/flux-grants'
import { createAdminProviderCatalogRoutes } from './routes/admin/provider-catalog'
import { createAdminUsersRoutes } from './routes/admin/users'
import { createAdminVoicePackRoutes } from './routes/admin/voice-packs'
import { createAudioSpeechWsHandlers } from './routes/audio-speech-ws'
import { createAudioTranscriptionStreamHandler } from './routes/audio-transcription-stream/route'
import { createAuthRoutes } from './routes/auth'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createV1Routes } from './routes/openai/v1'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createVoicePackRoutes } from './routes/voice-packs'
import { createConfigKVService } from './services/adapters/config-kv'
import { createEmailService } from './services/adapters/email'
import { createPosthogSink } from './services/adapters/posthog'
import { createAdminFluxGrantsService } from './services/domain/admin/flux-grants'
import { createAdminRouterConfigService } from './services/domain/admin/router-config'
import { createAdminUsersService } from './services/domain/admin/users'
import { createBillingService } from './services/domain/billing/billing-service'
import { createFluxMeter } from './services/domain/billing/flux-meter'
import { createCharacterService } from './services/domain/characters'
import { createChatService } from './services/domain/chats'
import { createFluxService } from './services/domain/flux'
import { createFluxTransactionService } from './services/domain/flux-transaction'
import { createConcurrencyLedger, createConfigSyncSubscriber, createLlmRouterService } from './services/domain/llm-router'
import { createProductEventService } from './services/domain/product-events'
import { createProviderCatalogService } from './services/domain/provider-catalog'
import { createProviderService } from './services/domain/providers'
import { createRequestLogService } from './services/domain/request-log'
import { createStripeService } from './services/domain/stripe'
import { createUserDeletionService } from './services/domain/user-deletion'
import { createVoicePackService } from './services/domain/voice-packs'
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
  adminUsersService: AdminUsersService
  ttsMeter: FluxMeter
  requestLogService: RequestLogService
  voicePackService: VoicePackService
  productEventService: ProductEventService
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  redis: Redis
  env: Env
  otel: OtelInstance | null
  userDeletionService: UserDeletionService
  llmRouter: LlmRouterService
  providerCatalogService: ProviderCatalogService
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
    productEventService: deps.productEventService,
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

    return audioSpeechWsSetup(session.user.id, {
      trigger: c.req.query('tts_trigger') === 'auto' ? 'auto' : 'manual',
      source: parseTtsSource(c.req.query('tts_source'), 'audio.speech.ws'),
      voiceType: parseTtsVoiceType(c.req.query('tts_voice_type')),
    })
  }))

  // Realtime ASR proxy. Mounted before the global bodyLimit middleware because
  // the request body is a live microphone PCM stream rather than a bounded JSON
  // payload. Auth is resolved manually here for the same reason.
  app.post('/api/v1/audio/transcriptions/stream', createAudioTranscriptionStreamHandler({
    auth: deps.auth,
    env: deps.env,
    configKV: deps.configKV,
    envelopeCrypto: deps.envelopeCrypto,
    providerCatalogService: deps.providerCatalogService,
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
  const v1Routes = createV1Routes({
    fluxService: deps.fluxService,
    billingService: deps.billingService,
    configKV: deps.configKV,
    requestLogService: deps.requestLogService,
    productEventService: deps.productEventService,
    ttsMeter: deps.ttsMeter,
    llmRouter: deps.llmRouter,
    providerCatalogService: deps.providerCatalogService,
    voicePackService: deps.voicePackService,
    genAi: deps.otel?.genAi,
    revenue: deps.otel?.revenue,
    rateLimitMetrics: deps.otel?.rateLimit,
  })

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
     * Admin dashboard entrypoint. Auth is enforced by `/api/admin/*`; the
     * standalone UI itself is public so unauthenticated users can be redirected
     * cleanly.
     */
    .route('/', createAdminUiRoutes(deps.env))

    /**
     * Character routes are handled by the character service.
     */
    .route('/api/v1/characters', createCharacterRoutes(deps.characterService))

    /**
     * Provider routes are handled by the provider service.
     */
    .route('/api/v1/providers', createProviderRoutes(deps.providerService))

    /**
     * Voice Pack routes expose the enabled curated library for binding.
     */
    .route('/api/v1/voice-packs', createVoicePackRoutes(deps.voicePackService))

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
    .route('/api/v1/stripe', createStripeRoutes(deps.fluxService, deps.stripeService, deps.billingService, deps.configKV, deps.env, deps.redis, deps.otel?.revenue, deps.otel?.rateLimit, deps.productEventService))

    /**
     * Admin routes — guarded by the `adminGuard` role check (`role === 'admin'`,
     * better-auth `admin` plugin). v1 only includes synchronous one-shot promo
     * flux grants.
     */
    .route('/api/admin/flux-grants', createAdminFluxGrantsRoutes(deps.adminFluxGrantsService))

    /**
     * Admin per-user balance override (set balance, incl. 0 for testing).
     * Account ban/unban live under the better-auth admin plugin at
     * `/api/auth/admin/ban-user` / `/api/auth/admin/unban-user`.
     */
    .route('/api/admin/users', createAdminUsersRoutes(deps.adminUsersService))

    /**
     * Admin Voice Pack curation routes.
     */
    .route('/api/admin/voice-packs', createAdminVoicePackRoutes({
      productEventService: deps.productEventService,
      service: deps.voicePackService,
    }))

    /**
     * Admin product capability alias curation routes.
     */
    .route('/api/admin/capability-aliases', createAdminCapabilityAliasRoutes({
      configKV: deps.configKV,
      service: deps.providerCatalogService,
    }))

    /**
     * Admin provider catalog curation routes.
     */
    .route('/api/admin/provider-catalog', createAdminProviderCatalogRoutes({
      configKV: deps.configKV,
      llmRouter: deps.llmRouter,
      service: deps.providerCatalogService,
    }))

    /**
     * Admin LLM router config seeding/patching. Single entry point for
     * writing `LLM_ROUTER_CONFIG`, `UNSPEECH_UPSTREAM`, and the
     * `DEFAULT_{CHAT,TTS}_MODEL` aliases — see
     * `routes/admin/config/router/index.ts` for the body shape.
     */
    .route('/api/admin/config/router', createAdminRouterConfigRoutes(deps.adminRouterConfigService))

    /**
     * Admin dashboard support APIs: user search, balance adjustments, metrics,
     * and editable LLM router config.
     */
    .route('/api/admin', createAdminRoutes({
      db: deps.db,
      billingService: deps.billingService,
      configKV: deps.configKV,
    }))

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

function parseTtsSource(
  value: string | undefined,
  fallback: 'audio.speech.ws',
): 'audio.speech.ws' | 'chat_auto_tts' | 'manual_preview' | 'settings_test' {
  switch (value) {
    case 'chat_auto_tts':
    case 'manual_preview':
    case 'settings_test':
      return value
    default:
      return fallback
  }
}

/**
 * Normalizes the client-provided streaming TTS voice bucket for product events.
 */
function parseTtsVoiceType(
  value: string | undefined,
): StreamingTtsVoiceType {
  switch (value) {
    case 'official_default':
    case 'official_selected':
    case 'custom_configured':
    case 'voice_pack':
      return value
    default:
      return 'unknown'
  }
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

  const posthogSink = injeca.provide('services:posthogSink', {
    dependsOn: { env: parsedEnv, lifecycle },
    // POSTHOG_PROJECT_KEY defaults to the shared project key, so the falsy
    // branch is only reachable via the documented off-switch: setting the
    // env var to an empty string (valibot defaults don't apply to '').
    build: ({ dependsOn }) => {
      if (!dependsOn.env.POSTHOG_PROJECT_KEY)
        return null

      const sink = createPosthogSink({
        projectKey: dependsOn.env.POSTHOG_PROJECT_KEY,
        host: dependsOn.env.POSTHOG_API_HOST,
      })
      dependsOn.lifecycle.appHooks.onStop(() => sink.shutdown())
      return sink
    },
  })

  const productEventService = injeca.provide('services:productEvents', {
    dependsOn: { db, otel, posthogSink },
    build: ({ dependsOn }) => createProductEventService(dependsOn.db, dependsOn.otel?.product, dependsOn.posthogSink),
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
    dependsOn: { db, otel, productEventService },
    build: ({ dependsOn }) => createChatService(dependsOn.db, dependsOn.otel?.engagement, dependsOn.productEventService),
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
    dependsOn: { db, env: parsedEnv, otel, email: emailService, userDeletionService, productEventService },
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
      return createAuth(dependsOn.db, dependsOn.env, dependsOn.email, dependsOn.otel?.auth, dependsOn.userDeletionService, dependsOn.productEventService)
    },
  })

  const requestLogService = injeca.provide('services:requestLog', {
    dependsOn: { db },
    build: ({ dependsOn }) => createRequestLogService(dependsOn.db),
  })

  const voicePackService = injeca.provide('services:voicePack', {
    dependsOn: { db },
    build: ({ dependsOn }) => createVoicePackService(dependsOn.db),
  })

  const providerCatalogService = injeca.provide('services:providerCatalog', {
    dependsOn: { db },
    build: ({ dependsOn }) => createProviderCatalogService(dependsOn.db),
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

  // Per-user admin operations (balance override). Delegates the balance write
  // to billingService.setFlux so the ledger stays single-sourced.
  const adminUsersService = injeca.provide('services:adminUsers', {
    dependsOn: { db, billingService },
    build: ({ dependsOn }) => createAdminUsersService({
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
  // Shared by the TTS router (acquires slots) and the pool watermark gauge
  // (reads the snapshot). Cluster-wide Redis state — the server is multi-instance.
  const ttsConcurrencyLedger = injeca.provide('services:ttsConcurrencyLedger', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConcurrencyLedger(dependsOn.redis),
  })

  const llmRouter = injeca.provide('services:llmRouter', {
    dependsOn: { configKV, envelopeCrypto, otel, redis, ttsConcurrencyLedger },
    build: ({ dependsOn }) => createLlmRouterService({
      configKV: dependsOn.configKV,
      envelopeCrypto: dependsOn.envelopeCrypto,
      gatewayMetrics: dependsOn.otel?.gateway ?? null,
      redis: dependsOn.redis,
      concurrencyLedger: dependsOn.ttsConcurrencyLedger,
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
    voicePackService,
    productEventService,
    stripeService,
    billingService,
    adminFluxGrantsService,
    adminRouterConfigService,
    adminUsersService,
    ttsMeter,
    configKV,
    envelopeCrypto,
    redis,
    env: parsedEnv,
    otel,
    userDeletionService,
    llmRouter,
    providerCatalogService,
    ttsConcurrencyLedger,
  })
  // Register the cluster-wide ObservableGauges for sessions / users. Each
  // replica polls the same DB (cached inside each gauge, in-flight coalesced);
  // dashboards aggregate with avg()/max(), not sum(). See
  // observability-conventions.md.
  //
  // Both gauges share the same `session` table: `user.active_sessions` is
  // `COUNT(*)` (row inflation prone), `user.distinct_active` is
  // `COUNT(DISTINCT user_id)` (real active-user count). Comparing the two
  // surfaces session-row leakage from missing GC + per-OIDC-token row
  // creation.
  if (resolved.otel) {
    registerTotalUsersGauge(resolved.otel.auth.totalUsers, resolved.db, resolved.otel.observability.metricReadErrors)
    registerActiveSessionsGauge(resolved.otel.auth.activeSessions, resolved.db, resolved.otel.observability.metricReadErrors)
    registerDistinctActiveUsersGauge(resolved.otel.auth.distinctActiveUsers, resolved.db, resolved.otel.observability.metricReadErrors)
    registerRollingActiveUsersGauge(resolved.otel.auth.rollingActiveUsers, resolved.db, resolved.otel.observability.metricReadErrors)
    registerTtsPoolGauge(resolved.otel.gateway.poolInflight, resolved.ttsConcurrencyLedger, resolved.otel.observability.metricReadErrors)
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
    voicePackService: resolved.voicePackService,
    billingService: resolved.billingService,
    adminFluxGrantsService: resolved.adminFluxGrantsService,
    adminRouterConfigService: resolved.adminRouterConfigService,
    adminUsersService: resolved.adminUsersService,
    ttsMeter: resolved.ttsMeter,
    requestLogService: resolved.requestLogService,
    productEventService: resolved.productEventService,
    configKV: resolved.configKV,
    envelopeCrypto: resolved.envelopeCrypto,
    redis: resolved.redis,
    env: resolved.env,
    otel: resolved.otel,
    userDeletionService: resolved.userDeletionService,
    llmRouter: resolved.llmRouter,
    providerCatalogService: resolved.providerCatalogService,
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
