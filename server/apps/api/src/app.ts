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
  billingService: BillingService
  characterService: CharacterService
  chatService: ChatService
  configKV: ConfigKVService
  db: Database
  env: Env
  envelopeCrypto: EnvelopeCrypto
  fluxService: FluxService
  fluxTransactionService: FluxTransactionService
  llmRouter: LlmRouterService
  otel: null | OtelInstance
  productEventService: ProductEventService
  providerCatalogService: ProviderCatalogService
  providerService: ProviderService
  redis: Redis
  requestLogService: RequestLogService
  stripeService: StripeService
  ttsMeter: FluxMeter
  userDeletionService: UserDeletionService
  voicePackService: VoicePackService
}

const MAX_UNAUTHENTICATED_CHAT_WS_FRAME_BYTES = 8192

export type AppType = Awaited<ReturnType<typeof buildApp>>['app']

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
        credentials: true,
        origin: origin => getTrustedOrigin(origin, deps.env.ADDITIONAL_TRUSTED_ORIGINS),
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
    requestLogService: deps.requestLogService,
    ttsMeter: deps.ttsMeter,
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
      source: parseTtsSource(c.req.query('tts_source'), 'audio.speech.ws'),
      trigger: c.req.query('tts_trigger') === 'auto' ? 'auto' : 'manual',
      voiceType: parseTtsVoiceType(c.req.query('tts_voice_type')),
    })
  }))

  // Realtime ASR proxy. Mounted before the global bodyLimit middleware because
  // the request body is a live microphone PCM stream rather than a bounded JSON
  // payload. Auth is resolved manually here for the same reason.
  app.post('/api/v1/audio/transcriptions/stream', createAudioTranscriptionStreamHandler({
    configKV: deps.configKV,
    db: deps.db,
    env: deps.env,
    envelopeCrypto: deps.envelopeCrypto,
    providerCatalogService: deps.providerCatalogService,
  }))

  // Cross-instance config invalidation. The subscriber owns its own
  // connection + lifecycle metrics; see services/llm-router/config-sync-subscriber.ts.
  createConfigSyncSubscriber({
    configKV: deps.configKV,
    gatewayMetrics: deps.otel?.gateway ?? null,
    instanceId: deps.env.OTEL_SERVICE_NAME,
    llmRouter: deps.llmRouter,
    logger: useLogger('config-sync').useGlobalConfig(),
    redis: deps.redis,
  })

  // Built once so the OpenAI-compat and audio routers share the same closure
  // (helpers like recordMetrics / recordRequestLog cross both surfaces) but
  // mount at different prefixes — see the `.route` calls below.
  const v1Routes = createV1Routes({
    billingService: deps.billingService,
    configKV: deps.configKV,
    fluxService: deps.fluxService,
    genAi: deps.otel?.genAi,
    llmRouter: deps.llmRouter,
    productEventService: deps.productEventService,
    providerCatalogService: deps.providerCatalogService,
    rateLimitMetrics: deps.otel?.rateLimit,
    requestLogService: deps.requestLogService,
    revenue: deps.otel?.revenue,
    ttsMeter: deps.ttsMeter,
    voicePackService: deps.voicePackService,
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
        const logFields = { cause: (err as { cause?: unknown }).cause, details: err.details }

        if (err.statusCode >= 500) {
          logger.withError(err).withFields(logFields).error('API error occurred')
        }
        else if (err.statusCode !== 401) {
          logger.withError(err).withFields(logFields).warn('API error occurred')
        }

        return c.json({
          details: err.details,
          error: err.errorCode,
          message: err.message,
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
          checks: { db: dbReady ? 'ok' : 'fail', redis: redisReady ? 'ok' : 'fail' },
          status: ready ? 'ready' : 'not_ready',
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
      docs: 'https://airi.moeru.ai/docs',
      message: 'This is the Project AIRI API server. Visit https://airi.moeru.ai to use the product, or see the docs at https://airi.moeru.ai/docs.',
      service: 'airi-api',
      ui: 'https://airi.moeru.ai',
    }))

    .route('/internal/auth', createInternalAuthRoutes({
      productEventService: deps.productEventService,
      userDeletionService: deps.userDeletionService,
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
    .route('/api/v1/stripe', createStripeRoutes(deps.fluxService, deps.stripeService, deps.billingService, deps.configKV, deps.env, deps.redis, deps.otel?.revenue, deps.otel?.rateLimit, deps.productEventService))

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

export async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))
  const logger = useLogger('app').useGlobalConfig()

  // Forward logg output to OpenTelemetry log exporter
  setGlobalHookPostLog((log) => {
    emitOtelLog(log.level, log.context, log.message, log.fields as Record<string, boolean | number | string>)
  })

  // NOTICE: OTel SDK lifecycle (start/shutdown) is owned entirely by
  // instrumentation.ts (preload). This factory only consumes the global
  // MeterProvider that the preload set up, builds metric handles, and primes
  // counters. No `lifecycle.onStop(shutdown)` here — preload registers SIGTERM
  // / SIGINT to flush exporters on its own.
  const otel = injeca.provide('libs:otel', {
    build: ({ dependsOn }) => initOtel(dependsOn.env),
    dependsOn: { env: parsedEnv },
  })

  const db = injeca.provide('datastore:db', {
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
    dependsOn: { env: parsedEnv, lifecycle, otel },
  })

  const redis = injeca.provide('datastore:redis', {
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
    dependsOn: { env: parsedEnv, lifecycle },
  })

  const configKV = injeca.provide('datastore:configKV', {
    build: ({ dependsOn }) => createConfigKVService(createConfigKVStore(dependsOn.db, dependsOn.redis)),
    dependsOn: { db, redis },
  })

  const posthogSink = injeca.provide('services:posthogSink', {
    // POSTHOG_PROJECT_KEY defaults to the shared project key, so the falsy
    // branch is only reachable via the documented off-switch: setting the
    // env var to an empty string (valibot defaults don't apply to '').
    build: ({ dependsOn }) => {
      if (!dependsOn.env.POSTHOG_PROJECT_KEY)
        return null

      const sink = createPosthogSink({
        host: dependsOn.env.POSTHOG_API_HOST,
        projectKey: dependsOn.env.POSTHOG_PROJECT_KEY,
      })
      dependsOn.lifecycle.appHooks.onStop(() => sink.shutdown())
      return sink
    },
    dependsOn: { env: parsedEnv, lifecycle },
  })

  const productEventService = injeca.provide('services:productEvents', {
    build: ({ dependsOn }) => createProductEventService(dependsOn.posthogSink),
    dependsOn: { posthogSink },
  })

  const characterService = injeca.provide('services:characters', {
    build: ({ dependsOn }) => createCharacterService(dependsOn.db, dependsOn.otel?.engagement),
    dependsOn: { db, otel },
  })

  const providerService = injeca.provide('services:providers', {
    build: ({ dependsOn }) => createProviderService(dependsOn.db),
    dependsOn: { db },
  })

  const chatService = injeca.provide('services:chats', {
    build: ({ dependsOn }) => createChatService(dependsOn.db, dependsOn.otel?.engagement),
    dependsOn: { db, otel },
  })

  const stripeService = injeca.provide('services:stripe', {
    build: ({ dependsOn }) => {
      // Stripe SDK is optional — when STRIPE_SECRET_KEY is unset (dev/CI)
      // billing routes degrade gracefully and the user-deletion pipeline
      // skips the API cancel call.
      const stripe = dependsOn.env.STRIPE_SECRET_KEY ? new Stripe(dependsOn.env.STRIPE_SECRET_KEY) : null
      return createStripeService(dependsOn.db, stripe)
    },
    dependsOn: { db, env: parsedEnv },
  })

  const fluxTransactionService = injeca.provide('services:fluxTransaction', {
    build: ({ dependsOn }) => createFluxTransactionService(dependsOn.db),
    dependsOn: { db },
  })

  const fluxService = injeca.provide('services:flux', {
    build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.redis, dependsOn.configKV),
    dependsOn: { configKV, db, redis },
  })

  // NOTICE:
  // The deletion service is a thin scheduler that delegates to each business
  // service's own `deleteAllForUser` method. Adding a new business module:
  //   1. give it a `deleteAllForUser(userId)` method
  //   2. add one `service.register(...)` line below
  // Domain knowledge stays inside each service instead of being copied into
  // a parallel handler file. See `server/apps/api/docs/ai-context/account-deletion.md`.
  const userDeletionService = injeca.provide('services:userDeletion', {
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
    dependsOn: { characterService, chatService, fluxService, providerService, stripeService },
  })

  const requestLogService = injeca.provide('services:requestLog', {
    build: ({ dependsOn }) => createRequestLogService(dependsOn.db),
    dependsOn: { db },
  })

  const voicePackService = injeca.provide('services:voicePack', {
    build: ({ dependsOn }) => createVoicePackService(dependsOn.db),
    dependsOn: { db },
  })

  const providerCatalogService = injeca.provide('services:providerCatalog', {
    build: ({ dependsOn }) => createProviderCatalogService(dependsOn.db),
    dependsOn: { db },
  })

  const billingService = injeca.provide('services:billing', {
    build: ({ dependsOn }) => createBillingService(dependsOn.db, dependsOn.redis, dependsOn.configKV, dependsOn.otel?.revenue),
    dependsOn: { configKV, db, otel, redis },
  })

  const ttsMeter = injeca.provide('services:ttsMeter', {
    build: ({ dependsOn }) => createFluxMeter(dependsOn.redis, dependsOn.billingService, {
      name: 'tts',
      // Lazy config read: missing FLUX_PER_1K_CHARS_TTS surfaces as a
      // per-request 503 (via route-level configGuard), not a server boot
      // failure that would take chat/auth/stripe down with it.
      resolveRuntime: async () => {
        const fluxPer1kChars = await dependsOn.configKV.getOrThrow('FLUX_PER_1K_CHARS_TTS')
        const ttl = await dependsOn.configKV.get('TTS_DEBT_TTL_SECONDS')
        return {
          debtTtlSeconds: ttl,
          unitsPerFlux: Math.max(1, Math.floor(1000 / fluxPer1kChars)),
        }
      },
    }, dependsOn.otel?.revenue),
    dependsOn: { billingService, configKV, otel, redis },
  })

  // Envelope crypto for at-rest upstream key decryption. Shared by the LLM
  // router (HTTP chat / TTS) and the audio-speech-ws proxy (streaming TTS)
  // so a single master-key change rotates every surface at once.
  const envelopeCrypto = injeca.provide('libs:envelopeCrypto', {
    build: ({ dependsOn }) => createEnvelopeCrypto({
      masterKey: dependsOn.env.LLM_ROUTER_MASTER_KEY,
      previousMasterKey: dependsOn.env.LLM_ROUTER_MASTER_KEY_PREVIOUS,
    }),
    dependsOn: { env: parsedEnv },
  })

  // LLM router (KTD-5 in-process replacement for the knoway sidecar).
  // LLM_ROUTER_MASTER_KEY is required at env-parse time, so this provider
  // always builds a real router — the legacy `null` fallback path is gone.
  // Shared by the TTS router (acquires slots) and the pool watermark gauge
  // (reads the snapshot). Cluster-wide Redis state — the server is multi-instance.
  const ttsConcurrencyLedger = injeca.provide('services:ttsConcurrencyLedger', {
    build: ({ dependsOn }) => createConcurrencyLedger(dependsOn.redis),
    dependsOn: { redis },
  })

  const llmRouter = injeca.provide('services:llmRouter', {
    build: ({ dependsOn }) => createLlmRouterService({
      concurrencyLedger: dependsOn.ttsConcurrencyLedger,
      configKV: dependsOn.configKV,
      envelopeCrypto: dependsOn.envelopeCrypto,
      gatewayMetrics: dependsOn.otel?.gateway ?? null,
      redis: dependsOn.redis,
    }),
    dependsOn: { configKV, envelopeCrypto, otel, redis, ttsConcurrencyLedger },
  })

  await injeca.start()
  const resolved = await injeca.resolve({
    billingService,
    characterService,
    chatService,
    configKV,
    db,
    env: parsedEnv,
    envelopeCrypto,
    fluxService,
    fluxTransactionService,
    llmRouter,
    otel,
    productEventService,
    providerCatalogService,
    providerService,
    redis,
    requestLogService,
    stripeService,
    ttsConcurrencyLedger,
    ttsMeter,
    userDeletionService,
    voicePackService,
  })
  if (resolved.otel) {
    registerTtsPoolGauge(resolved.otel.gateway.poolInflight, resolved.ttsConcurrencyLedger, resolved.otel.observability.metricReadErrors)
    registerWsOnlineUsersGauge(resolved.otel.engagement.wsUsersOnline, resolved.redis, resolved.otel.observability.metricReadErrors)
  }

  const appDeps = {
    billingService: resolved.billingService,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    configKV: resolved.configKV,
    db: resolved.db,
    env: resolved.env,
    envelopeCrypto: resolved.envelopeCrypto,
    fluxService: resolved.fluxService,
    fluxTransactionService: resolved.fluxTransactionService,
    llmRouter: resolved.llmRouter,
    otel: resolved.otel,
    productEventService: resolved.productEventService,
    providerCatalogService: resolved.providerCatalogService,
    providerService: resolved.providerService,
    redis: resolved.redis,
    requestLogService: resolved.requestLogService,
    stripeService: resolved.stripeService,
    ttsMeter: resolved.ttsMeter,
    userDeletionService: resolved.userDeletionService,
    voicePackService: resolved.voicePackService,
  }

  const { app, injectWebSocket } = await buildApp(appDeps)

  logger.withFields({ hostname: resolved.env.HOST, port: resolved.env.PORT, role: 'api' }).log('Server started')

  return {
    app,
    hostname: resolved.env.HOST,
    injectWebSocket,
    port: resolved.env.PORT,
  }
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
    case 'custom_configured':
    case 'official_default':
    case 'official_selected':
    case 'voice_pack':
      return value
    default:
      return 'unknown'
  }
}
