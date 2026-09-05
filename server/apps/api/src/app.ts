import type { Database } from './libs/db'
import type { Env } from './libs/env'
import type { OtelInstance } from './otel'
import type { StreamingTtsVoiceType } from './routes/audio-speech-ws/session'
import type { ConfigKVService } from './services/adapters/config-kv'
import type { BillingService } from './services/domain/billing/billing-service'
import type { FluxMeter } from './services/domain/billing/flux-meter'
import type { CharacterService } from './services/domain/characters'
import type { ChatService } from './services/domain/chats'
import type { FluxService } from './services/domain/flux'
import type { FluxTransactionService } from './services/domain/flux-transaction'
import type { LlmRouterService } from './services/domain/llm-router'
import type { PaymentService } from './services/domain/payment'
import type { ProductEventService } from './services/domain/product-events'
import type { ProviderCatalogService } from './services/domain/provider-catalog'
import type { ProviderService } from './services/domain/providers'
import type { RequestLogService } from './services/domain/request-log'
import type { UserDeletionService } from './services/domain/user-deletion'
import type { VoicePackService } from './services/domain/voice-packs'
import type { HonoEnv } from './types/hono'
import type { EnvelopeCrypto } from './utils/envelope-crypto'

import process from 'node:process'

import Redis from 'ioredis'
import Stripe from 'stripe'

import { initLogger, LoggerFormat, LoggerLevel, setGlobalHookPostLog, useLogger } from '@guiiai/logg'
import { createNodeWebSocket } from '@hono/node-ws'
import { httpInstrumentationMiddleware } from '@hono/otel'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca, lifecycle } from 'injeca'

import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { resolveRequestAuth } from './libs/request-auth'
import { createUnauthorizedWsEvents } from './libs/ws-auth'
import { sessionMiddleware } from './middlewares/auth'
import { emitOtelLog, initOtel } from './otel'
import { registerDbPoolGauge } from './otel/gauges/db-pool'
import { registerTtsPoolGauge } from './otel/gauges/tts-pool'
import { registerWsOnlineUsersGauge } from './otel/gauges/ws-online-users'
import { createAudioSpeechWsHandlers } from './routes/audio-speech-ws'
import { createAudioTranscriptionStreamHandler } from './routes/audio-transcription-stream/route'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsRuntime } from './routes/chat-ws/runtime'
import { createChatWsV1Handlers } from './routes/chat-ws/v1'
import { createChatWsV2Handlers } from './routes/chat-ws/v2'
import { createChatWsPayloadLimit } from './routes/chat-ws/v2/payload-limit'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createInternalAuthRoutes } from './routes/internal-auth'
import { createV1Routes } from './routes/openai/v1'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createVoicePackRoutes } from './routes/voice-packs'
import { createConfigKVService } from './services/adapters/config-kv'
import { createConfigKVStore } from './services/adapters/config-kv/store'
import { createPosthogSink } from './services/adapters/posthog'
import { createBillingService } from './services/domain/billing/billing-service'
import { createFluxMeter } from './services/domain/billing/flux-meter'
import { createCharacterService } from './services/domain/characters'
import { createChatService } from './services/domain/chats'
import { createFluxService } from './services/domain/flux'
import { createFluxTransactionService } from './services/domain/flux-transaction'
import { createConcurrencyLedger, createConfigSyncSubscriber, createLlmRouterService } from './services/domain/llm-router'
import { createPaymentService } from './services/domain/payment'
import { createProductEventService } from './services/domain/product-events'
import { createProviderCatalogService } from './services/domain/provider-catalog'
import { createProviderService } from './services/domain/providers'
import { createRequestLogService } from './services/domain/request-log'
import { createUserDeletionService } from './services/domain/user-deletion'
import { createVoicePackService } from './services/domain/voice-packs'
import { createEnvelopeCrypto } from './utils/envelope-crypto'
import { ApiError, createInternalError } from './utils/error'
import { nanoid } from './utils/id'
import { getTrustedOrigin } from './utils/origin'

interface AppDeps {
  db: Database
  characterService: CharacterService
  chatService: ChatService
  providerService: ProviderService
  fluxService: FluxService
  fluxTransactionService: FluxTransactionService
  paymentService: PaymentService
  stripe: Stripe | null
  billingService: BillingService
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

const MAX_UNAUTHENTICATED_CHAT_WS_FRAME_BYTES = 8192

export async function buildApp(deps: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  const app = new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      await next()

      // NOTICE: Stale API payloads are unsafe to serve from edge caches after
      // user, billing, or configuration mutations.
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
  const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({ app })
  const chatWsPayloadLimit = createChatWsPayloadLimit(MAX_UNAUTHENTICATED_CHAT_WS_FRAME_BYTES)
  wss.on('connection', (socket, request) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/ws/v2/chat')
      return

    // NOTICE:
    // @hono/node-ws creates one ws server with a 100 MiB default frame limit.
    // The library has no per-route maxPayload option, so use ws's receiver limit.
    // Source: @hono/node-ws@1.3.0 dist/index.js; ws@8.20.0 Receiver._maxPayload.
    // Removal condition: @hono/node-ws supports maxPayload per upgrade route.
    chatWsPayloadLimit.restrict(socket)
  })
  // Per-process stable id used by the chat-ws sub callback to skip echoes of
  // its own publishes. Falls back to a random nanoid when ops do not provide
  // SERVER_INSTANCE_ID, which is fine because we only need uniqueness across
  // simultaneously-running api instances, not across restarts.
  const instanceId = process.env.SERVER_INSTANCE_ID || nanoid()
  const chatWsRuntime = createChatWsRuntime(deps.redis, instanceId, deps.otel?.engagement ?? null)
  const chatWsV2Setup = createChatWsV2Handlers(
    deps.chatService,
    deps.redis,
    instanceId,
    async (token) => {
      const session = await resolveRequestAuth(
        deps.db,
        deps.env,
        new Headers({ Authorization: `Bearer ${token}` }),
      )
      return session?.user?.id ?? null
    },
    deps.otel?.engagement ?? null,
    chatWsRuntime,
    chatWsPayloadLimit.restore,
  )
  const chatWsV1Setup = createChatWsV1Handlers(deps.chatService, deps.redis, instanceId, deps.otel?.engagement ?? null, chatWsRuntime)

  // `/ws/chat` keeps query-token authentication for deployed clients. The
  // Eventa beta.15 adapter accepts their beta.13 envelopes. `/ws/v2/chat`
  // authenticates after the connection opens.
  app.get('/ws/chat', upgradeWebSocket(async (c) => {
    const token = c.req.query('token')
    if (!token)
      return createUnauthorizedWsEvents()

    const session = await resolveRequestAuth(
      deps.db,
      deps.env,
      new Headers({ Authorization: `Bearer ${token}` }),
    )
    if (!session?.user)
      return createUnauthorizedWsEvents()

    return chatWsV1Setup(session.user.id)
  }))

  app.get('/ws/v2/chat', upgradeWebSocket(() => chatWsV2Setup()))

  // Bidirectional streaming TTS proxy. The handler factory builds one ws-to-ws
  // bridge per connection: client ↔ server/apps/api ↔ unspeech ↔ upstream
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
      deps.db,
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
    db: deps.db,
    env: deps.env,
    configKV: deps.configKV,
    envelopeCrypto: deps.envelopeCrypto,
    providerCatalogService: deps.providerCatalogService,
  }))

  // Cross-instance config invalidation. The subscriber owns its own
  // connection + lifecycle metrics; see services/llm-router/config-sync-subscriber.ts.
  createConfigSyncSubscriber({
    redis: deps.redis,
    configKV: deps.configKV,
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
    .use('*', sessionMiddleware(deps.db, deps.env))
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

    .route('/internal/auth', createInternalAuthRoutes({
      userDeletionService: deps.userDeletionService,
      productEventService: deps.productEventService,
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
    .route('/api/v1/stripe', createStripeRoutes(
      deps.paymentService,
      deps.db,
      deps.stripe,
      deps.redis,
      deps.configKV,
      deps.env,
      deps.otel?.revenue ?? null,
      deps.otel?.rateLimit ?? null,
      deps.productEventService,
    ))

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
 * Normalizes the client-provided streaming TTS voice bucket for request telemetry.
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
    dependsOn: { env: parsedEnv, lifecycle, otel },
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

      if (dependsOn.otel)
        registerDbPoolGauge(dependsOn.otel.database.poolConnections, pool)
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
          const instance = new Redis(dependsOn.env.REDIS_URL, { lazyConnect: true })

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
    dependsOn: { db, redis },
    build: ({ dependsOn }) => createConfigKVService(createConfigKVStore(dependsOn.db, dependsOn.redis)),
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
    dependsOn: { posthogSink },
    build: ({ dependsOn }) => createProductEventService(dependsOn.posthogSink),
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

  const stripe = injeca.provide('libs:stripe', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => {
      // Stripe SDK is optional — when STRIPE_SECRET_KEY is unset (dev/CI)
      // billing routes degrade gracefully.
      return dependsOn.env.STRIPE_SECRET_KEY ? new Stripe(dependsOn.env.STRIPE_SECRET_KEY) : null
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

  const paymentService = injeca.provide('services:payment', {
    dependsOn: { db, billingService },
    build: ({ dependsOn }) => createPaymentService(dependsOn.db, dependsOn.billingService),
  })

  // NOTICE:
  // The deletion service is a thin scheduler that delegates to each business
  // service's own `deleteAllForUser` method. Adding a new business module:
  //   1. give it a `deleteAllForUser(userId)` method
  //   2. add one `service.register(...)` line below
  // Domain knowledge stays inside each service instead of being copied into
  // a parallel handler file. See `server/apps/api/docs/ai-context/account-deletion.md`.
  const userDeletionService = injeca.provide('services:userDeletion', {
    dependsOn: { paymentService, fluxService, providerService, characterService, chatService },
    build: ({ dependsOn }) => {
      const service = createUserDeletionService()
      // priority: 20 = financial / cache state (Flux balance + Redis),
      //           30 = pure DB soft-delete (no external touch).
      service.register({ name: 'payment', priority: 30, softDelete: ({ userId }) => dependsOn.paymentService.deleteAllForUser(userId) })
      service.register({ name: 'flux', priority: 20, softDelete: ({ userId }) => dependsOn.fluxService.deleteAllForUser(userId) })
      service.register({ name: 'providers', priority: 30, softDelete: ({ userId }) => dependsOn.providerService.deleteAllForUser(userId) })
      service.register({ name: 'characters', priority: 30, softDelete: ({ userId }) => dependsOn.characterService.deleteAllForUser(userId) })
      service.register({ name: 'chats', priority: 30, softDelete: ({ userId }) => dependsOn.chatService.deleteAllForUser(userId) })
      return service
    },
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
    characterService,
    chatService,
    providerService,
    fluxService,
    fluxTransactionService,
    requestLogService,
    voicePackService,
    productEventService,
    paymentService,
    stripe,
    billingService,
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
  if (resolved.otel) {
    registerTtsPoolGauge(resolved.otel.gateway.poolInflight, resolved.ttsConcurrencyLedger, resolved.otel.observability.metricReadErrors)
    registerWsOnlineUsersGauge(resolved.otel.engagement.wsUsersOnline, resolved.redis, resolved.otel.observability.metricReadErrors)
  }

  const appDeps = {
    db: resolved.db,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    providerService: resolved.providerService,
    fluxService: resolved.fluxService,
    fluxTransactionService: resolved.fluxTransactionService,
    paymentService: resolved.paymentService,
    stripe: resolved.stripe,
    voicePackService: resolved.voicePackService,
    billingService: resolved.billingService,
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
  }

  const { app, injectWebSocket } = await buildApp(appDeps)

  logger.withFields({ role: 'api', hostname: resolved.env.HOST, port: resolved.env.PORT }).log('Server started')

  return {
    app,
    injectWebSocket,
    port: resolved.env.PORT,
    hostname: resolved.env.HOST,
  }
}
