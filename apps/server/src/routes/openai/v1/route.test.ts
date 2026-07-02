import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxService } from '../../../services/domain/flux'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { ChatGenerationTrace, TtsGenerationTrace } from '../../../services/domain/llm-tracing'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { ProviderCatalogService } from '../../../services/domain/provider-catalog'
import type { RequestLogService } from '../../../services/domain/request-log'
import type { VoicePackService } from '../../../services/domain/voice-packs'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createV1Routes } from '.'
import { ApiError } from '../../../utils/error'

function createMockFluxService(flux = 100): FluxService {
  return {
    getFlux: vi.fn(async () => ({ userId: 'user-1', flux })),
    updateStripeCustomerId: vi.fn(),
  } as any
}

function createMockBillingService(flux = 100): BillingService {
  let balance = flux
  return {
    consumeFluxForLLM: vi.fn(async (input: { userId: string, amount: number }) => {
      // Mirror billing-service.ts:debitFlux semantics so route tests see the
      // same `charged < requested` signal that production callers handle.
      if (balance <= 0)
        throw Object.assign(new Error('Insufficient flux'), { statusCode: 402 })
      const charged = Math.min(input.amount, balance)
      balance -= charged
      return { userId: input.userId, flux: balance, charged, requested: input.amount }
    }),
    creditFlux: vi.fn(),
    creditFluxFromStripeCheckout: vi.fn(),
    creditFluxFromInvoice: vi.fn(),
  } as any
}

function createMockConfigKV(overrides: Record<string, any> = {}): ConfigKVService {
  const defaults: Record<string, any> = {
    FLUX_PER_REQUEST: 1,
    FLUX_PER_1K_CHARS_TTS: 2,
    TTS_DEBT_TTL_SECONDS: 86400,
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
    DEFAULT_TTS_MODEL: 'tts-1',
    LLM_ROUTER_CONFIG: {
      llm: { models: { 'openai/gpt-5-mini': { upstreams: [] } } },
      tts: { models: {} },
    },
    ...overrides,
  }
  return {
    getOrThrow: vi.fn(async (key: string) => {
      if (defaults[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return defaults[key]
    }),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    get: vi.fn(async (key: string) => defaults[key]),
    set: vi.fn(),
  } as any
}

function createMockRequestLogService(): RequestLogService {
  return {
    logRequest: vi.fn(async () => undefined),
  }
}

// NOTE: a router-mock helper used to live here but was removed because the
// existing route tests all exercise the legacy fetch path (llmRouter = null).
// Router internals are exhaustively covered in
// apps/server/src/services/llm-router/router.test.ts (15 tests). Add a
// router-injecting helper here when route-level routing tests are introduced.

function createMockTtsMeter(unitsPerFlux = 1000) {
  let debt = 0
  return {
    assertCanAfford: vi.fn(async (_userId: string, newUnits: number, currentBalance: number) => {
      const projectedFlux = Math.floor((debt + newUnits) / unitsPerFlux)
      const required = Math.max(projectedFlux, currentBalance <= 0 ? 1 : 0)
      if (currentBalance < required)
        throw new ApiError(402, 'PAYMENT_REQUIRED', 'Insufficient flux')
    }),
    accumulate: vi.fn(async ({ units, currentBalance }: { units: number, currentBalance: number }) => {
      debt += units
      const fluxDebited = Math.floor(debt / unitsPerFlux)
      debt -= fluxDebited * unitsPerFlux
      return { fluxDebited, debtAfter: debt, balanceAfter: currentBalance - fluxDebited }
    }),
    peekDebt: vi.fn(async () => debt),
    config: { name: 'tts', unitsPerFlux, debtTtlSeconds: 86400 },
  } as any
}

function createMockLlmTracing() {
  return {
    startChatGeneration: vi.fn((): ChatGenerationTrace => ({
      appendStreamChunk: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    startTtsGeneration: vi.fn((): TtsGenerationTrace => ({
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
  }
}

function createMockLlmRouter(impl?: Partial<LlmRouterService>): LlmRouterService {
  return {
    // Default: forward to globalThis.fetch so existing chat tests that mock
    // fetch keep working. Per-test overrides can replace `route` directly.
    route: vi.fn(async ({ modelName, body, abortSignal }) => {
      return globalThis.fetch('http://mock-gateway/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model: modelName }),
        signal: abortSignal,
      })
    }),
    // TTS default also forwards to fetch, against a stable path tests can
    // assert on. The mocked response body becomes the audio payload.
    routeTts: vi.fn(async ({ modelName, input, abortSignal }) => {
      return globalThis.fetch('http://mock-gateway/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, input: input.text, voice: input.voice }),
        signal: abortSignal,
      })
    }),
    listTtsVoices: vi.fn(async () => []),
    invalidateConfig: vi.fn(),
    invalidateTtsVoicesCache: vi.fn(async () => undefined),
    ...impl,
  } as LlmRouterService
}

function createMockProductEventService(): ProductEventService {
  return {
    track: vi.fn(async () => undefined),
    countDistinctUsersByFeature: vi.fn(async () => []),
  }
}

function createMockVoicePackService(impl?: Partial<VoicePackService>): VoicePackService {
  return {
    listEnabled: vi.fn(async () => []),
    list: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
    disable: vi.fn(),
    findById: vi.fn(async () => null),
    findEnabledByVoiceId: vi.fn(async () => null),
    ...impl,
  } as unknown as VoicePackService
}

function createMockProviderCatalogService(impl?: Partial<ProviderCatalogService>): ProviderCatalogService {
  let syncedAliasRoutes: Array<{
    id: string
    aliasId: string
    routerModelId: string
    pool: 'primary' | 'fallback'
    enabled: boolean
    weight: number
    displayOrder: number
    createdAt: Date
    updatedAt: Date
  }> = []
  let syncedModels: Awaited<ReturnType<ProviderCatalogService['syncTtsModelsFromRouterConfig']>> = []
  const syncedVoicesByModel = new Map<string, Awaited<ReturnType<ProviderCatalogService['syncTtsVoices']>>>()

  return {
    syncAliasesFromRouterConfig: vi.fn(async (input: Parameters<ProviderCatalogService['syncAliasesFromRouterConfig']>[0]) => {
      const { surface, modelIds } = input
      syncedAliasRoutes = Array.from(new Set(modelIds)).map((routerModelId, index) => ({
        id: `alias-route-${index}`,
        aliasId: 'alias-auto',
        routerModelId,
        pool: 'primary',
        enabled: true,
        weight: 1,
        displayOrder: index,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      return [{
        id: 'alias-auto',
        surface,
        aliasId: 'auto',
        displayName: 'Auto',
        enabled: true,
        displayOrder: 0,
        fallbackEnabled: true,
        loadBalancingEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]
    }),
    listAliases: vi.fn(async () => []),
    resolveEnabledAlias: vi.fn(async (surface, aliasId) => ({
      id: `alias-${aliasId}`,
      surface,
      aliasId,
      displayName: aliasId,
      enabled: true,
      displayOrder: 0,
      fallbackEnabled: true,
      loadBalancingEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      routes: aliasId === 'auto'
        ? (syncedAliasRoutes.length > 0
            ? syncedAliasRoutes
            : [{
                id: 'alias-route-auto',
                aliasId: 'alias-auto',
                routerModelId: 'openai/gpt-5-mini',
                pool: 'primary',
                enabled: true,
                weight: 1,
                displayOrder: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              }])
        : [{
            id: `alias-route-${aliasId}`,
            aliasId: `alias-${aliasId}`,
            routerModelId: aliasId,
            pool: 'primary',
            enabled: true,
            weight: 1,
            displayOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }],
    })),
    syncTtsModelsFromRouterConfig: vi.fn(async (input: Parameters<ProviderCatalogService['syncTtsModelsFromRouterConfig']>[0]) => {
      const { models } = input
      syncedModels = Object.entries(models).sort(([a], [b]) => a.localeCompare(b)).map(([routerModelId, model], index) => ({
        id: `tts-model-${index}`,
        routerModelId,
        provider: model.provider,
        displayName: routerModelId,
        enabled: true,
        displayOrder: index,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      return syncedModels
    }),
    listTtsModels: vi.fn(async () => []),
    listEnabledTtsModels: vi.fn(async () => syncedModels),
    assertTtsModelEnabled: vi.fn(async routerModelId => ({
      id: 'tts-model-1',
      routerModelId,
      provider: 'azure',
      displayName: routerModelId,
      enabled: true,
      displayOrder: 0,
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    syncTtsVoices: vi.fn(async (input: Parameters<ProviderCatalogService['syncTtsVoices']>[0]) => {
      const { routerModelId, voices } = input
      const syncedVoices = voices.map((voice, index) => ({
        id: `tts-voice-${index}`,
        ttsModelId: 'tts-model-1',
        providerVoiceId: voice.id,
        displayName: voice.name ?? voice.id,
        enabled: true,
        displayOrder: index,
        languages: voice.languages ?? [],
        labels: voice.labels ?? {},
        previewAudioUrl: voice.previewAudioUrl ?? null,
        source: 'provider-sync' as const,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      syncedVoicesByModel.set(routerModelId, syncedVoices)
      return syncedVoices
    }),
    listTtsVoices: vi.fn(async () => []),
    listEnabledTtsVoices: vi.fn(async routerModelId => syncedVoicesByModel.get(routerModelId) ?? []),
    getTtsVoiceWithModel: vi.fn(async () => null),
    assertTtsVoiceEnabled: vi.fn(async (_routerModelId, providerVoiceId) => ({
      id: 'tts-voice-1',
      ttsModelId: 'tts-model-1',
      providerVoiceId,
      displayName: providerVoiceId,
      enabled: true,
      displayOrder: 0,
      languages: [],
      labels: {},
      previewAudioUrl: null,
      source: 'provider-sync',
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    ...impl,
  } as ProviderCatalogService
}

function createTestApp(
  fluxService: FluxService,
  configKV: ConfigKVService,
  billingService?: BillingService,
  requestLogService?: RequestLogService,
  ttsMeter?: ReturnType<typeof createMockTtsMeter>,
  llmRouter?: LlmRouterService,
  llmTracing = createMockLlmTracing(),
  productEventService = createMockProductEventService(),
  voicePackService = createMockVoicePackService(),
  providerCatalogService = createMockProviderCatalogService(),
) {
  const { openaiRoutes, audioRoutes } = createV1Routes({
    fluxService,
    billingService: billingService ?? createMockBillingService(),
    configKV,
    requestLogService: requestLogService ?? createMockRequestLogService(),
    productEventService,
    ttsMeter: ttsMeter ?? createMockTtsMeter(),
    llmRouter: llmRouter ?? createMockLlmRouter(),
    voicePackService,
    providerCatalogService,
    genAi: null,
    revenue: null,
    rateLimitMetrics: null,
    llmTracing,
  })
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        error: err.errorCode,
        message: err.message,
        details: err.details,
      }, err.statusCode)
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500)
  })

  // Inject user from env (simulates sessionMiddleware)
  app.use('*', async (c, next) => {
    const user = (c.env as any)?.user
    if (user) {
      c.set('user', user)
    }
    await next()
  })

  // Mounting mirrors production (see app.ts): chat completions under
  // `/api/v1/openai`, audio under `/api/v1/audio`. Test request URLs were
  // batch-migrated from the legacy `/api/v1/openai/audio/*` prefix when the
  // audio surface was split out of the OpenAI-compat namespace.
  app.route('/api/v1/openai', openaiRoutes)
  app.route('/api/v1/audio', audioRoutes)
  return app
}

const testUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' }

describe('v1CompletionsRoutes', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  describe('pOST /api/v1/openai/chat/completions', () => {
    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
      )

      const res = await app.request('/api/v1/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
      })
      expect(res.status).toBe(401)
    })

    it('should return 402 when flux is insufficient', async () => {
      const app = createTestApp(
        createMockFluxService(0),
        createMockConfigKV(),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(402)
    })

    // ROOT CAUSE:
    //
    // Before: pre-flight gated only on `flux > 0`. A user with 0 < balance <
    // fallbackRate could pass the gate, complete the stream, then either land
    // in the catch path (insufficient balance throws) or — worse — race N
    // parallel requests through and have all but one land unbilled.
    //
    // After: gate compares balance against `FLUX_PER_REQUEST` so the very
    // first request a partially-funded user makes is rejected without
    // touching the upstream. Combined with partial-debit semantics in
    // `consumeFluxForLLM`, this closes both the serial-replay and concurrent
    // race forms of the unpaid-usage exploit.
    it('rejects pre-flight when balance is below FLUX_PER_REQUEST (Issue: unpaid-usage-exploit)', async () => {
      const fluxService = createMockFluxService(5)
      const billingService = createMockBillingService(5)
      globalThis.fetch = vi.fn() as any
      const app = createTestApp(
        fluxService,
        createMockConfigKV({ FLUX_PER_REQUEST: 38 }),
        billingService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(402)
      // Critical: upstream was never called — leak is closed before cost is incurred.
      expect(globalThis.fetch).not.toHaveBeenCalled()
      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    it('rate-limits chat completions at the gateway operation boundary', async () => {
      globalThis.fetch = vi.fn(async () =>
        Response.json({
          id: 'chatcmpl-test',
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })) as any
      const llmRouter = createMockLlmRouter()
      const app = createTestApp(
        createMockFluxService(1000),
        createMockConfigKV(),
        createMockBillingService(1000),
        undefined,
        undefined,
        llmRouter,
      )

      for (let i = 0; i < 60; i += 1) {
        const res = await app.fetch(
          new Request('http://localhost/api/v1/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: `hi ${i}` }] }),
          }),
          { user: testUser } as any,
        )
        expect(res.status).toBe(200)
      }

      const limited = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'blocked' }] }),
        }),
        { user: testUser } as any,
      )
      const body = await limited.json()

      expect(limited.status).toBe(429)
      expect(body).toEqual({ error: 'TOO_MANY_REQUESTS', message: 'Too many requests' })
      expect(llmRouter.route).toHaveBeenCalledTimes(60)
    })

    // ROOT CAUSE:
    //
    // Before: when usage arrived and `fluxConsumed > balance`, debitFlux
    // threw, the response had already been delivered, and the user's balance
    // never moved. Same user with the same script kept replaying.
    //
    // After: balance is drained to zero (`charged = balance`), the request
    // log records the actual `charged` (5, not the full 38), and the next
    // request fails the pre-flight gate.
    it('non-streaming completion drains partial balance and logs charged (Issue: unpaid-usage-exploit)', async () => {
      const upstreamBody = JSON.stringify({
        id: 'chatcmpl-partial',
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 20000, completion_tokens: 18000 },
      })
      globalThis.fetch = vi.fn(async () => new Response(upstreamBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      // Balance 5 passes the gate when fallbackRate is 5 (matching schema default),
      // but the per-token cost lands at ceil(38000/1000 * 1) = 38 → partial debit.
      const fluxService = createMockFluxService(5)
      const billingService = createMockBillingService(5)
      const requestLogService = createMockRequestLogService()
      const app = createTestApp(
        fluxService,
        createMockConfigKV({ FLUX_PER_REQUEST: 5, FLUX_PER_1K_TOKENS: 1 }),
        billingService,
        requestLogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      // Caller asked for 38 (token-based cost), mock-billing returns charged=5.
      expect(billingService.consumeFluxForLLM).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 38 }),
      )
      expect(requestLogService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', fluxConsumed: 5 }),
      )
    })

    it('should proxy upstream response on success', async () => {
      const upstreamBody = JSON.stringify({ id: 'chatcmpl-1', choices: [{ message: { content: 'hello' } }] })
      globalThis.fetch = vi.fn(async () => new Response(upstreamBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const fluxService = createMockFluxService(100)
      const billingService = createMockBillingService(100)
      const configKV = createMockConfigKV()
      const app = createTestApp(fluxService, configKV, billingService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { id: string }
      expect(data.id).toBe('chatcmpl-1')

      expect(billingService.consumeFluxForLLM).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 1 }),
      )

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"model":"openai/gpt-5-mini"'),
        }),
      )
    })

    it('resolves "auto" model through the capability alias catalog', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const providerCatalogService = createMockProviderCatalogService()
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_CHAT_MODEL: 'anthropic/claude-sonnet' }),
        undefined,
        undefined,
        undefined,
        undefined,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"model":"openai/gpt-5-mini"'),
        }),
      )
      expect(providerCatalogService.syncAliasesFromRouterConfig).not.toHaveBeenCalled()
    })

    it('resolves an enabled non-auto model alias through the provider catalog', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'openai/gpt-5-mini', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"model":"openai/gpt-5-mini"'),
        }),
      )
    })

    it('rejects disabled LLM aliases before upstream routing', async () => {
      const route = vi.fn(async () => new Response('{}', { status: 200 }))
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => {
          throw new ApiError(400, 'CAPABILITY_ALIAS_DISABLED', 'Capability alias is disabled')
        }),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        createMockLlmRouter({ route }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('CAPABILITY_ALIAS_DISABLED')
      expect(route).not.toHaveBeenCalled()
    })

    it('rejects missing LLM aliases before upstream routing', async () => {
      const route = vi.fn(async () => new Response('{}', { status: 200 }))
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => {
          throw new ApiError(400, 'CAPABILITY_ALIAS_NOT_FOUND', 'Capability alias is not configured')
        }),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        createMockLlmRouter({ route }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('CAPABILITY_ALIAS_NOT_FOUND')
      expect(route).not.toHaveBeenCalled()
    })

    it('falls back to the alias fallback pool when every primary route is exhausted', async () => {
      const route = vi.fn(async ({ modelName }, ctx) => {
        if (modelName === 'openai/primary')
          throw new ApiError(502, 'BAD_GATEWAY', 'primary exhausted')
        if (ctx) {
          ctx.provider = 'openrouter'
          ctx.upstreamModel = modelName
        }
        return new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
      const now = new Date()
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => ({
          id: 'alias-auto',
          surface: 'llm' as const,
          aliasId: 'auto',
          displayName: 'Auto',
          enabled: true,
          displayOrder: 0,
          fallbackEnabled: true,
          loadBalancingEnabled: false,
          createdAt: now,
          updatedAt: now,
          routes: [
            { id: 'route-primary', aliasId: 'alias-auto', routerModelId: 'openai/primary', pool: 'primary' as const, enabled: true, weight: 1, displayOrder: 0, createdAt: now, updatedAt: now },
            { id: 'route-fallback', aliasId: 'alias-auto', routerModelId: 'openai/fallback', pool: 'fallback' as const, enabled: true, weight: 1, displayOrder: 1, createdAt: now, updatedAt: now },
          ],
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_CHAT_MODEL: 'openai/primary',
          LLM_ROUTER_CONFIG: {
            llm: { models: { 'openai/primary': { upstreams: [] }, 'openai/fallback': { upstreams: [] } } },
            tts: { models: {} },
          },
        }),
        undefined,
        undefined,
        undefined,
        createMockLlmRouter({ route }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      expect(route).toHaveBeenCalledTimes(2)
      expect(route).toHaveBeenNthCalledWith(1, expect.objectContaining({ modelName: 'openai/primary' }), expect.any(Object))
      expect(route).toHaveBeenNthCalledWith(2, expect.objectContaining({ modelName: 'openai/fallback' }), expect.any(Object))
    })

    it('does not use the alias fallback pool when fallback is disabled', async () => {
      const route = vi.fn(async () => {
        throw new ApiError(502, 'BAD_GATEWAY', 'primary exhausted')
      })
      const now = new Date()
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => ({
          id: 'alias-auto',
          surface: 'llm' as const,
          aliasId: 'auto',
          displayName: 'Auto',
          enabled: true,
          displayOrder: 0,
          fallbackEnabled: false,
          loadBalancingEnabled: false,
          createdAt: now,
          updatedAt: now,
          routes: [
            { id: 'route-primary', aliasId: 'alias-auto', routerModelId: 'openai/primary', pool: 'primary' as const, enabled: true, weight: 1, displayOrder: 0, createdAt: now, updatedAt: now },
            { id: 'route-fallback', aliasId: 'alias-auto', routerModelId: 'openai/fallback', pool: 'fallback' as const, enabled: true, weight: 1, displayOrder: 1, createdAt: now, updatedAt: now },
          ],
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_CHAT_MODEL: 'openai/primary',
          LLM_ROUTER_CONFIG: {
            llm: { models: { 'openai/primary': { upstreams: [] }, 'openai/fallback': { upstreams: [] } } },
            tts: { models: {} },
          },
        }),
        undefined,
        undefined,
        undefined,
        createMockLlmRouter({ route }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(502)
      expect(route).toHaveBeenCalledTimes(1)
      expect(route).toHaveBeenCalledWith(expect.objectContaining({ modelName: 'openai/primary' }), expect.any(Object))
    })

    it('uses weighted primary routing when alias load balancing is enabled', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.95)
      const route = vi.fn(async ({ modelName }, ctx) => {
        if (ctx) {
          ctx.provider = 'openrouter'
          ctx.upstreamModel = modelName
        }
        return new Response(JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
      const now = new Date()
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => ({
          id: 'alias-auto',
          surface: 'llm' as const,
          aliasId: 'auto',
          displayName: 'Auto',
          enabled: true,
          displayOrder: 0,
          fallbackEnabled: false,
          loadBalancingEnabled: true,
          createdAt: now,
          updatedAt: now,
          routes: [
            { id: 'route-a', aliasId: 'alias-auto', routerModelId: 'openai/light', pool: 'primary' as const, enabled: true, weight: 1, displayOrder: 0, createdAt: now, updatedAt: now },
            { id: 'route-b', aliasId: 'alias-auto', routerModelId: 'openai/heavy', pool: 'primary' as const, enabled: true, weight: 9, displayOrder: 1, createdAt: now, updatedAt: now },
          ],
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_CHAT_MODEL: 'openai/light',
          LLM_ROUTER_CONFIG: {
            llm: { models: { 'openai/light': { upstreams: [] }, 'openai/heavy': { upstreams: [] } } },
            tts: { models: {} },
          },
        }),
        undefined,
        undefined,
        undefined,
        createMockLlmRouter({ route }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      try {
        const res = await app.fetch(
          new Request('http://localhost/api/v1/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'auto', messages: [] }),
          }),
          { user: testUser } as any,
        )

        expect(res.status).toBe(200)
        expect(route).toHaveBeenCalledTimes(1)
        expect(route).toHaveBeenCalledWith(expect.objectContaining({ modelName: 'openai/heavy' }), expect.any(Object))
      }
      finally {
        randomSpy.mockRestore()
      }
    })

    it('records Langfuse chat generation with the router-resolved upstream model', async () => {
      const llmRouter = createMockLlmRouter({
        route: vi.fn(async (_req, ctx) => {
          if (ctx) {
            ctx.provider = 'openrouter'
            ctx.upstreamModel = 'openai/gpt-4o-mini'
          }
          return new Response(JSON.stringify({
            choices: [],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }) as any,
      })
      const llmTracing = createMockLlmTracing()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, llmRouter, llmTracing)

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'chat-auto', messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )

      expect(llmTracing.startChatGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-4o-mini',
          requestId: expect.any(String),
          userId: 'user-1',
        }),
      )
    })

    it('should not charge flux when upstream returns error', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"error":"bad"}', {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }))

      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(100), createMockConfigKV(), billingService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(500)
      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    it('should return 503 when config keys are missing', async () => {
      const configKV = createMockConfigKV()
      configKV.getOrThrow = vi.fn(async (key: string) => {
        if (key === 'LLM_ROUTER_CONFIG')
          throw new ApiError(503, 'CONFIG_NOT_SET', 'Service configuration is incomplete')
        return createMockConfigKV().getOrThrow(key as never)
      })
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => {
          throw new ApiError(503, 'CONFIG_NOT_SET', 'Service configuration is incomplete')
        }),
      })

      const app = createTestApp(
        createMockFluxService(),
        configKV,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(503)
    })

    it('writes a synchronous llm_request_log entry after a successful debit', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const requestLogService = createMockRequestLogService()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, requestLogService)

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(requestLogService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          model: 'gpt-4',
          status: 200,
          fluxConsumed: 1,
        }),
      )
    })

    it('should abort downstream stream and skip billing when upstream stream fails mid-response', async () => {
      const streamFailure = new Error('upstream stream failed')
      let chunkSent = false

      globalThis.fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!chunkSent) {
            chunkSent = true
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n'))
            return
          }

          throw streamFailure
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }))

      const billingService = createMockBillingService(100)
      const requestLogService = createMockRequestLogService()
      const app = createTestApp(createMockFluxService(100), createMockConfigKV(), billingService, requestLogService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      await expect(res.text()).rejects.toThrow('upstream stream failed')

      await Promise.resolve()

      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
      expect(requestLogService.logRequest).not.toHaveBeenCalled()
    })
  })

  describe('legacy audio paths under /openai/', () => {
    // Audio used to live at /api/v1/openai/audio/*. After the refactor it
    // moved to /api/v1/audio/*; these are kept as 404 sentinels so a
    // future accidental re-mount under the old prefix is caught by tests.
    // Codex review LOW #6.
    it('returns 404 for /api/v1/openai/audio/speech (moved to /api/v1/audio/speech)', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/speech', { method: 'POST' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
    it('returns 404 for /api/v1/openai/audio/voices', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/voices', { method: 'GET' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
    it('returns 404 for /api/v1/openai/audio/models', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())
      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
  })

  describe('pOST /api/v1/audio/speech', () => {
    it('should proxy TTS request to upstream with resolved model', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_MODEL: 'tts-1-hd' }),
      )

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'test', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/audio/speech',
        expect.objectContaining({
          body: expect.stringContaining('"model":"tts-1-hd"'),
        }),
      )
    })

    it('rejects disabled provider catalog TTS models before billing or upstream routing', async () => {
      const routeTts = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }))
      const ttsMeter = createMockTtsMeter()
      const providerCatalogService = createMockProviderCatalogService({
        assertTtsModelEnabled: vi.fn(async () => {
          throw new ApiError(400, 'PROVIDER_CATALOG_TTS_MODEL_DISABLED', 'Provider catalog TTS model is disabled')
        }),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_MODEL: 'microsoft/v1' }),
        undefined,
        undefined,
        ttsMeter,
        createMockLlmRouter({ routeTts }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'test', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('PROVIDER_CATALOG_TTS_MODEL_DISABLED')
      expect(ttsMeter.assertCanAfford).not.toHaveBeenCalled()
      expect(routeTts).not.toHaveBeenCalled()
    })

    it('rejects disabled provider catalog TTS voices before billing or upstream routing', async () => {
      const routeTts = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }))
      const ttsMeter = createMockTtsMeter()
      const providerCatalogService = createMockProviderCatalogService({
        assertTtsVoiceEnabled: vi.fn(async () => {
          throw new ApiError(400, 'PROVIDER_CATALOG_TTS_VOICE_DISABLED', 'Provider catalog TTS voice is disabled')
        }),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_MODEL: 'microsoft/v1' }),
        undefined,
        undefined,
        ttsMeter,
        createMockLlmRouter({ routeTts }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'test', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('PROVIDER_CATALOG_TTS_VOICE_DISABLED')
      expect(providerCatalogService.assertTtsVoiceEnabled).toHaveBeenCalledWith('microsoft/v1', 'alloy')
      expect(ttsMeter.assertCanAfford).not.toHaveBeenCalled()
      expect(routeTts).not.toHaveBeenCalled()
    })

    /**
     * @example
     * POST /api/v1/audio/speech { "model": "voice-pack", "voice": "friendly-azure" }
     */
    it('resolves Voice Pack aliases to server-owned model, voice, and params', async () => {
      const routeTts = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_MODEL: 'microsoft/v1' }),
        undefined,
        undefined,
        undefined,
        createMockLlmRouter({ routeTts }),
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService({
          findEnabledByVoiceId: vi.fn(async () => ({
            id: 'vp-azure',
            name: 'Azure',
            description: null,
            provider: 'azure',
            model: 'microsoft/v1',
            voiceId: 'friendly-azure',
            upstreamVoiceId: 'en-US-AvaMultilingualNeural',
            ttsModelId: 'microsoft/v1',
            params: { pitch: 20, volume: 5, rate: 1.2 },
            costMultiplier: 1.5,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        }),
      )

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'voice-pack',
            input: 'test',
            voice: 'friendly-azure',
          }),
        }),
        { user: testUser } as any,
      )

      expect(routeTts).toHaveBeenCalledWith(
        expect.objectContaining({
          modelName: 'microsoft/v1',
          input: expect.objectContaining({
            text: 'test',
            voice: 'en-US-AvaMultilingualNeural',
            speed: 1.2,
            extraOptions: {
              pitch: 20,
              volume: 5,
            },
          }),
        }),
        expect.any(Object),
      )
    })

    it('should bill per character with minimum charge', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const billingService = createMockBillingService(100)
      // Debt ledger: short input below unitsPerFlux accumulates without debit.
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService)

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hello', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    /**
     * @example
     * POST /api/v1/audio/speech { "input": "hello", "voice": "alloy" }
     */
    it('uses Voice Pack cost multiplier for affordability and billing units', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const ttsMeter = createMockTtsMeter()
      const voicePackService = createMockVoicePackService({
        findEnabledByVoiceId: vi.fn(async () => ({
          id: 'vp-premium',
          name: 'Premium',
          description: null,
          provider: 'azure',
          model: 'microsoft/v1',
          voiceId: 'alloy',
          upstreamVoiceId: 'upstream-alloy',
          ttsModelId: 'tts-1',
          params: {},
          costMultiplier: 2,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        ttsMeter,
        undefined,
        createMockLlmTracing(),
        createMockProductEventService(),
        voicePackService,
      )

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'auto',
            input: 'hello',
            voice: 'alloy',
          }),
        }),
        { user: testUser } as any,
      )

      expect(ttsMeter.assertCanAfford).toHaveBeenCalledWith('user-1', 10, 100)
      expect(ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({
        units: 10,
        metadata: expect.objectContaining({
          costMultiplier: 2,
        }),
      }))
    })

    /**
     * @example
     * POST /api/v1/audio/speech { "voice": "alloy" }
     */
    it('records TTS voice and Voice Pack metadata in product events', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const productEventService = createMockProductEventService()
      const voicePackService = createMockVoicePackService({
        findEnabledByVoiceId: vi.fn(async () => ({
          id: 'vp-premium',
          name: 'Premium',
          description: null,
          provider: 'azure',
          model: 'microsoft/v1',
          voiceId: 'alloy',
          upstreamVoiceId: 'upstream-alloy',
          ttsModelId: 'tts-1',
          params: {},
          costMultiplier: 2,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        undefined,
        createMockLlmTracing(),
        productEventService,
        voicePackService,
      )

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'auto',
            input: 'hello',
            voice: 'alloy',
            extra_body: {
              airi_analytics: {
                source: 'manual_preview',
                voice_type: 'official_selected',
              },
            },
          }),
        }),
        { user: testUser } as any,
      )

      expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
        action: 'speech_succeeded',
        source: 'manual_preview',
        metadata: expect.objectContaining({
          voice_id: 'alloy',
          voice_type: 'voice_pack',
          voice_pack_id: 'vp-premium',
        }),
      }))
      expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
        action: 'speech_requested',
        metadata: expect.objectContaining({
          voice_id: 'alloy',
          voice_type: 'voice_pack',
          voice_pack_id: 'vp-premium',
        }),
      }))
    })

    it('should not charge when routeTts upstream returns error', async () => {
      const llmRouter = createMockLlmRouter({
        routeTts: vi.fn(async () => new Response('{"error":"service down"}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })) as any,
      })
      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hello', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(500)
      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    /**
     * @example
     * routeTts throws ApiError(429, 'TOO_MANY_REQUESTS', 'Too many requests')
     */
    it('records routeTts ApiError status and reason in product events', async () => {
      const productEventService = createMockProductEventService()
      const llmRouter = createMockLlmRouter({
        routeTts: vi.fn(async () => {
          throw new ApiError(429, 'TOO_MANY_REQUESTS', 'Too many requests')
        }) as any,
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        productEventService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hello', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(429)
      expect(productEventService.track).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'speech_failed',
          reason: 'TOO_MANY_REQUESTS',
          metadata: expect.objectContaining({
            failure_reason: 'TOO_MANY_REQUESTS',
            http_status: 429,
          }),
        }),
      )
    })

    it('returns 402 and records blocked event for manual TTS when flux is insufficient', async () => {
      const productEventService = createMockProductEventService()
      const llmRouter = createMockLlmRouter()
      const app = createTestApp(
        createMockFluxService(0),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        productEventService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hello', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(402)
      expect(llmRouter.routeTts).not.toHaveBeenCalled()
      expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
        action: 'speech_blocked',
        status: 'blocked',
        source: 'audio.speech',
        reason: 'insufficient_balance',
        metadata: expect.objectContaining({
          trigger: 'manual',
          block_reason: 'insufficient_balance',
          balance_state: 'insufficient',
          flux_balance_bucket: 'zero',
        }),
      }))
    })

    it('returns 204 and records blocked event for auto TTS when flux is insufficient', async () => {
      const productEventService = createMockProductEventService()
      const llmRouter = createMockLlmRouter()
      const app = createTestApp(
        createMockFluxService(0),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        productEventService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'auto',
            input: 'hello',
            voice: 'alloy',
            extra_body: {
              airi_analytics: {
                trigger: 'auto',
                source: 'chat_auto_tts',
              },
            },
          }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(204)
      expect(llmRouter.routeTts).not.toHaveBeenCalled()
      expect(productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
        action: 'speech_blocked',
        status: 'blocked',
        source: 'chat_auto_tts',
        reason: 'insufficient_balance',
        metadata: expect.objectContaining({
          trigger: 'auto',
          block_reason: 'insufficient_balance',
          balance_state: 'insufficient',
          flux_balance_bucket: 'zero',
        }),
      }))
    })

    it('should not charge when input is empty', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService)

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: '', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      // Debt ledger: empty input adds 0 units, no debit triggered.
      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    it('should charge proportionally for long input', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const billingService = createMockBillingService(100)
      const ttsMeter = createMockTtsMeter()
      // Mock meter unitsPerFlux = 1000, input = 2500 chars → debit 2 Flux, 500 dust.
      const longInput = 'a'.repeat(2500)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService, undefined, ttsMeter)

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: longInput, voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(ttsMeter.accumulate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', units: 2500 }),
      )
    })

    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.request('/api/v1/audio/voices', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    // ROOT CAUSE:
    //
    // Before patch, `handleTTS` ran `ttsMeter.accumulate()` outside any
    // try/finally and set the billing attribute + called `span.end()`
    // *afterwards*. If `accumulate()` rejected (e.g. Redis blip on
    // INCRBY), the call site threw straight to `app.onError` and the
    // active span was never closed — OTel batched-span buffer leaked one
    // span per failed TTS billing event, and `recordRequestLog` was
    // skipped silently.
    //
    // After patch (apps/server/src/routes/openai/v1/index.ts:471-493):
    // `accumulate()` + `span.setAttribute()` are wrapped in try/finally,
    // span.end() runs unconditionally, and the error propagates to the
    // global handler. recordRequestLog is still skipped (we can't log a
    // billing-failed request without a fluxConsumed value), but the
    // failure is now observable instead of hidden by a leaked span.
    it('tTS billing failure closes the span and surfaces error to onError (regression)', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const requestLogService = createMockRequestLogService()
      const ttsMeter = createMockTtsMeter()
      // Override accumulate to simulate a Redis INCRBY failure mid-billing.
      ttsMeter.accumulate = vi.fn(async () => {
        throw new Error('redis INCRBY timeout')
      })

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        requestLogService,
        ttsMeter,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hi', voice: 'en-US-AvaMultilingualNeural' }),
        }),
        { user: testUser } as any,
      )

      // Generic Error (not ApiError) → onError renders 500.
      expect(res.status).toBe(500)
      // recordRequestLog never reached, by design (no fluxConsumed to log).
      expect(requestLogService.logRequest).not.toHaveBeenCalled()
      // accumulate was actually attempted (proves we walked into the billing
      // block, not the upstream-error branch).
      expect(ttsMeter.accumulate).toHaveBeenCalledTimes(1)
    })

    it('should forward routeTts error status (502)', async () => {
      const llmRouter = createMockLlmRouter({
        routeTts: vi.fn(async () => new Response('{"error":"bad"}', {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })) as any,
      })

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hi', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(502)
    })
  })

  describe('gET /api/v1/audio/models', () => {
    it('exposes Voice Pack beside every configured tts model id', async () => {
      const providerCatalogService = createMockProviderCatalogService({
        listEnabledTtsModels: vi.fn(async () => [
          {
            id: 'tts-model-aliyun',
            routerModelId: 'alibaba/cosyvoice-v2',
            provider: 'dashscope-cosyvoice',
            displayName: 'alibaba/cosyvoice-v2',
            enabled: true,
            displayOrder: 0,
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'tts-model-azure',
            routerModelId: 'microsoft/v1',
            provider: 'azure',
            displayName: 'microsoft/v1',
            enabled: true,
            displayOrder: 1,
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_TTS_MODEL: 'microsoft/v1',
          LLM_ROUTER_CONFIG: {
            llm: { models: {} },
            tts: {
              models: {
                'microsoft/v1': { provider: 'azure', upstreams: [] as unknown[] },
                'alibaba/cosyvoice-v2': { provider: 'dashscope-cosyvoice', upstreams: [] as unknown[] },
              },
            },
          },
        }),
        undefined,
        undefined,
        undefined,
        undefined,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: { id: string, name: string }[], default: string }
      expect(data.models.map(m => m.id)).toEqual([
        'voice-pack',
        'alibaba/cosyvoice-v2',
        'microsoft/v1',
      ])
      expect(data.models[0]).toMatchObject({
        id: 'voice-pack',
        name: 'Voice Pack',
        description: 'Server-curated voices',
      })
      expect(data.default).toBe('microsoft/v1')
      expect(providerCatalogService.syncTtsModelsFromRouterConfig).not.toHaveBeenCalled()
    })

    it('keeps the Voice Pack model entry when no tts models are configured', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          LLM_ROUTER_CONFIG: { llm: { models: {} }, tts: { models: {} } },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: { id: string, name: string }[] }
      expect(data.models).toEqual([{
        id: 'voice-pack',
        name: 'Voice Pack',
        description: 'Server-curated voices',
      }])
    })

    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.request('/api/v1/audio/models', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('gET /api/v1/audio/models/streaming', () => {
    it('returns the operator-configured streaming model catalog + default', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          UNSPEECH_UPSTREAM: {
            restBaseURL: 'http://unspeech.local:5933',
            streaming: {
              baseURL: 'wss://unspeech.local',
              keys: [{ id: 'k1', ciphertext: 'enc' }],
              models: [
                { id: 'volcengine/seed-tts-2.0', name: 'Volcengine Seed-TTS 2.0', description: 'TTS 2.0' },
                { id: 'volcengine/seed-tts-1.0' },
              ],
              defaultModel: 'volcengine/seed-tts-2.0',
            },
          },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { available: boolean, models: { id: string, name: string, description?: string }[], default: string | null }
      expect(data.available).toBe(true)
      expect(data.models).toEqual([
        { id: 'volcengine/seed-tts-2.0', name: 'Volcengine Seed-TTS 2.0', description: 'TTS 2.0' },
        { id: 'volcengine/seed-tts-1.0', name: 'volcengine/seed-tts-1.0' },
      ])
      expect(data.default).toBe('volcengine/seed-tts-2.0')
    })

    it('returns default: null when operator has not set a streaming default', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          UNSPEECH_UPSTREAM: {
            restBaseURL: 'http://unspeech.local:5933',
            streaming: {
              baseURL: 'wss://unspeech.local',
              keys: [{ id: 'k1', ciphertext: 'enc' }],
              models: [{ id: 'volcengine/seed-tts-2.0', name: 'Vol' }],
            },
          },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      const data = await res.json() as { default: string | null }
      expect(data.default).toBeNull()
    })

    it('returns an empty list when UNSPEECH_UPSTREAM is unset', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { available: boolean, models: unknown[] }
      expect(data.available).toBe(false)
      expect(data.models).toEqual([])
    })

    it('reports available: true with empty models when streaming subtree has no models', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          UNSPEECH_UPSTREAM: {
            restBaseURL: 'http://unspeech.local:5933',
            streaming: {
              baseURL: 'wss://unspeech.local',
              keys: [{ id: 'k1', ciphertext: 'enc' }],
            },
          },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { available: boolean, models: unknown[] }
      expect(data.available).toBe(true)
      expect(data.models).toEqual([])
    })

    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.request('/api/v1/audio/models/streaming', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('gET /api/v1/audio/voices', () => {
    it('returns the recommended bucket scoped to the explicit model id', async () => {
      const voices = [
        { id: 'en-US-JennyNeural', name: 'Jenny', provider: 'azure', locale: 'en-US', gender: 'Female', previewAudioUrl: 'https://example.com/jenny.mp3' },
        { id: 'en-US-AvaMultilingualNeural', name: 'Ava', provider: 'azure', locale: 'en-US', gender: 'Female' },
      ]
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => voices) as any,
      })
      const providerCatalogService = createMockProviderCatalogService({
        listEnabledTtsVoices: vi.fn(async () => [
          {
            id: 'tts-voice-jenny',
            ttsModelId: 'tts-model-azure',
            providerVoiceId: 'en-US-JennyNeural',
            displayName: 'Jenny',
            enabled: true,
            displayOrder: 0,
            languages: [],
            labels: {},
            previewAudioUrl: 'https://example.com/jenny.mp3',
            source: 'provider-sync',
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'tts-voice-ava',
            ttsModelId: 'tts-model-azure',
            providerVoiceId: 'en-US-AvaMultilingualNeural',
            displayName: 'Ava',
            enabled: true,
            displayOrder: 1,
            languages: [],
            labels: {},
            previewAudioUrl: null,
            source: 'provider-sync',
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      })
      const configKV = createMockConfigKV({
        DEFAULT_TTS_VOICES: {
          'microsoft/v1': { 'en-US': 'en-US-AvaMultilingualNeural' },
          'other-model': { 'en-US': 'should-not-leak' },
        },
      })

      const app = createTestApp(
        createMockFluxService(),
        configKV,
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=microsoft/v1', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { voices: Array<Record<string, unknown>>, recommended: Record<string, string> }
      expect(data.voices[0]).toEqual({
        id: 'en-US-JennyNeural',
        name: 'Jenny',
        languages: [],
        labels: {},
        preview_audio_url: 'https://example.com/jenny.mp3',
      })
      expect(data.voices[1]).toMatchObject({
        id: 'en-US-AvaMultilingualNeural',
        name: 'Ava',
        languages: [],
        labels: {},
      })
      expect(data.voices[1]).not.toHaveProperty('preview_audio_url')
      expect(data.recommended).toEqual({ 'en-US': 'en-US-AvaMultilingualNeural' })
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })

    it('lists enabled Voice Packs from the Voice Pack model without upstream details', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => [
          { id: 'en-US-AvaMultilingualNeural', name: 'Ava', languages: [{ code: 'en-US', title: 'English' }] },
        ]) as any,
      })
      const voicePackService = createMockVoicePackService({
        listEnabled: vi.fn(async () => [
          {
            id: 'vp-1',
            name: 'Narrator',
            description: 'Warm voice',
            provider: 'azure',
            model: 'microsoft/v1',
            voiceId: 'narrator-alias',
            upstreamVoiceId: 'en-US-AvaMultilingualNeural',
            ttsModelId: 'microsoft/v1',
            params: {},
            costMultiplier: 2,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'vp-other',
            name: 'Other model pack',
            description: null,
            provider: 'alibaba',
            model: 'cosyvoice-v1',
            voiceId: 'other-model-alias',
            upstreamVoiceId: 'longxiaochun',
            ttsModelId: 'alibaba/cosyvoice-v1',
            params: {},
            costMultiplier: 1,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_VOICES: { 'microsoft/v1': { 'en-US': 'en-US-AvaMultilingualNeural' } } }),
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        createMockProductEventService(),
        voicePackService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=voice-pack', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { voices: Array<Record<string, unknown>> }
      expect(data.voices[0]).toMatchObject({
        id: 'narrator-alias',
        name: 'Narrator',
        description: 'Warm voice · Flux cost: 2x',
      })
      expect(data.voices[0]).not.toHaveProperty('upstreamVoiceId')
      expect(data.voices[0]).not.toHaveProperty('ttsModelId')
      expect(data.voices[1]).toMatchObject({ id: 'other-model-alias' })
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })

    it('does not mix Voice Packs into concrete model voice catalogs', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => [
          { id: 'en-US-AvaMultilingualNeural', name: 'Ava', languages: [{ code: 'en-US', title: 'English' }] },
        ]) as any,
      })
      const voicePackService = createMockVoicePackService({
        listEnabled: vi.fn(async () => [{
          id: 'vp-1',
          name: 'Narrator',
          description: 'Warm voice',
          provider: 'azure',
          model: 'microsoft/v1',
          voiceId: 'narrator-alias',
          upstreamVoiceId: 'en-US-AvaMultilingualNeural',
          ttsModelId: 'microsoft/v1',
          params: {},
          costMultiplier: 2,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]),
      })
      const providerCatalogService = createMockProviderCatalogService({
        listEnabledTtsVoices: vi.fn(async () => [{
          id: 'tts-voice-ava',
          ttsModelId: 'tts-model-azure',
          providerVoiceId: 'en-US-AvaMultilingualNeural',
          displayName: 'Ava',
          enabled: true,
          displayOrder: 0,
          languages: [{ code: 'en-US', title: 'English' }],
          labels: {},
          previewAudioUrl: null,
          source: 'provider-sync',
          lastSyncedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }]),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_VOICES: { 'microsoft/v1': { 'en-US': 'en-US-AvaMultilingualNeural' } } }),
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        createMockProductEventService(),
        voicePackService,
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=microsoft/v1', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { voices: Array<Record<string, unknown>> }
      expect(data.voices).toEqual([
        {
          id: 'en-US-AvaMultilingualNeural',
          name: 'Ava',
          languages: [{ code: 'en-US', title: 'English' }],
          labels: {},
        },
      ])
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })

    it('hides provider voices that are not enabled in the provider catalog', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => [
          { id: 'en-US-AvaMultilingualNeural', name: 'Ava' },
        ]) as any,
      })
      const providerCatalogService = createMockProviderCatalogService({
        listEnabledTtsVoices: vi.fn(async () => []),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        llmRouter,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=microsoft/v1', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { voices: Array<Record<string, unknown>> }
      expect(data.voices).toEqual([])
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
      expect(providerCatalogService.syncTtsVoices).not.toHaveBeenCalled()
    })

    it('returns an empty recommended map when the resolved model has no bucket', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => []) as any,
      })
      const configKV = createMockConfigKV({
        DEFAULT_TTS_VOICES: {
          'other-model': { 'en-US': 'something' },
        },
      })

      const app = createTestApp(createMockFluxService(), configKV, undefined, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=alibaba/cosyvoice-v1', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { recommended: Record<string, string> }
      expect(data.recommended).toEqual({})
    })

    it('uses the explicit ?model= query when provided instead of DEFAULT_TTS_MODEL', async () => {
      const providerCatalogService = createMockProviderCatalogService()

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        undefined,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      await app.fetch(new Request('http://localhost/api/v1/audio/voices?model=alibaba/cosyvoice-v1'), { user: testUser } as any)
      expect(providerCatalogService.listEnabledTtsVoices).toHaveBeenCalledWith('alibaba/cosyvoice-v1')
    })

    it('resolves `auto` model to configKV DEFAULT_TTS_MODEL', async () => {
      const providerCatalogService = createMockProviderCatalogService()
      const configKV = createMockConfigKV({ DEFAULT_TTS_MODEL: 'microsoft/v1' })

      const app = createTestApp(
        createMockFluxService(),
        configKV,
        undefined,
        undefined,
        undefined,
        undefined,
        createMockLlmTracing(),
        createMockProductEventService(),
        createMockVoicePackService(),
        providerCatalogService,
      )

      await app.fetch(new Request('http://localhost/api/v1/audio/voices?model=auto'), { user: testUser } as any)
      expect(providerCatalogService.listEnabledTtsVoices).toHaveBeenCalledWith('microsoft/v1')
    })

    it('returns 400 MISSING_MODEL when ?model= is omitted (no implicit fallback)', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => []) as any,
      })

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string, message?: string }
      expect(body.error).toBe('MISSING_MODEL')
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })

    it('returns 400 MISSING_MODEL when ?model= is empty string', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => []) as any,
      })

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(400)
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })
  })

  describe('gET /api/v1/audio/voices/streaming', () => {
    function mockUnspeechVoices(voices: unknown[]) {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ voices }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as any
    }

    function mockUnspeechFailure(status: number, body = 'boom') {
      globalThis.fetch = vi.fn(async () => new Response(body, { status })) as any
    }

    it('returns the streaming-model bucket of DEFAULT_TTS_VOICES when ?model= matches', async () => {
      mockUnspeechVoices([{ id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0' }])
      const configKV = createMockConfigKV({
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ id: 'k1', ciphertext: 'enc' }] } },
        DEFAULT_TTS_VOICES: {
          'seed-tts-2.0': { 'zh-cn': 'zh_female_vv_uranus_bigtts' },
          'seed-tts-1.0': { 'zh-cn': 'should-not-leak' },
        },
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices/streaming?model=seed-tts-2.0'),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { recommended: Record<string, string> }
      expect(data.recommended).toEqual({ 'zh-cn': 'zh_female_vv_uranus_bigtts' })
    })

    it('returns empty recommended when ?model= is omitted', async () => {
      mockUnspeechVoices([])
      const configKV = createMockConfigKV({
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ id: 'k1', ciphertext: 'enc' }] } },
        DEFAULT_TTS_VOICES: { 'seed-tts-2.0': { 'zh-cn': 'x' } },
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices/streaming'),
        { user: testUser } as any,
      )

      const data = await res.json() as { recommended: Record<string, string> }
      expect(data.recommended).toEqual({})
    })

    it('returns empty recommended when the requested model has no configKV bucket', async () => {
      mockUnspeechVoices([])
      const configKV = createMockConfigKV({
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ id: 'k1', ciphertext: 'enc' }] } },
        DEFAULT_TTS_VOICES: { 'seed-tts-2.0': { 'zh-cn': 'x' } },
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices/streaming?model=seed-tts-1.0'),
        { user: testUser } as any,
      )

      const data = await res.json() as { recommended: Record<string, string> }
      expect(data.recommended).toEqual({})
    })

    it('returns 503 STREAMING_TTS_NOT_CONFIGURED when UNSPEECH_UPSTREAM.streaming is absent', async () => {
      mockUnspeechVoices([])
      const configKV = createMockConfigKV({
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933' },
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices/streaming'),
        { user: testUser } as any,
      )

      expect(res.status).toBe(503)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('STREAMING_TTS_NOT_CONFIGURED')
    })

    it('returns 502 BAD_GATEWAY when unspeech responds non-2xx', async () => {
      mockUnspeechFailure(503, 'unspeech is sleeping')
      const configKV = createMockConfigKV({
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ id: 'k1', ciphertext: 'enc' }] } },
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices/streaming?model=seed-tts-2.0'),
        { user: testUser } as any,
      )

      expect(res.status).toBe(502)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('BAD_GATEWAY')
    })

    it('returns 502 BAD_GATEWAY when unspeech fetch throws', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }) as any
      const configKV = createMockConfigKV({
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ id: 'k1', ciphertext: 'enc' }] } },
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices/streaming?model=seed-tts-2.0'),
        { user: testUser } as any,
      )

      expect(res.status).toBe(502)
    })
  })

  describe('route matching', () => {
    it('gET /api/v1/openai/chat/completions should return 404', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', { method: 'GET' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })

    it('pOST /api/v1/openai/chat/completion (singular) should return 404', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
  })
})
