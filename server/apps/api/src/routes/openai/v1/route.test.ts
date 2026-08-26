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
import {
  AIRI_CHAT_APP_SURFACE_HEADER,
  AIRI_CHAT_ROUND_ID_HEADER,
  AIRI_CHAT_SESSION_ID_HEADER,
} from './analytics'

function createMockBillingService(flux = 100): BillingService {
  let balance = flux
  return {
    consumeFluxForLLM: vi.fn(async (input: { amount: number, userId: string }) => {
      // Mirror billing-service.ts:debitFlux semantics so route tests see the
      // same `charged < requested` signal that production callers handle.
      if (balance <= 0)
        throw Object.assign(new Error('Insufficient flux'), { statusCode: 402 })
      const charged = Math.min(input.amount, balance)
      balance -= charged
      return { charged, flux: balance, requested: input.amount, userId: input.userId }
    }),
    creditFlux: vi.fn(),
    creditFluxFromInvoice: vi.fn(),
    creditFluxFromStripeCheckout: vi.fn(),
  } as any
}

function createMockConfigKV(overrides: Record<string, any> = {}): ConfigKVService {
  const defaults: Record<string, any> = {
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
    DEFAULT_TTS_MODEL: 'tts-1',
    FLUX_PER_1K_CHARS_TTS: 2,
    FLUX_PER_REQUEST: 1,
    LLM_ROUTER_CONFIG: {
      llm: { models: { 'openai/gpt-5-mini': { upstreams: [] } } },
      tts: { models: {} },
    },
    TTS_DEBT_TTL_SECONDS: 86400,
    ...overrides,
  }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    getOrThrow: vi.fn(async (key: string) => {
      if (defaults[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return defaults[key]
    }),
    set: vi.fn(),
  } as any
}

function createMockFluxService(flux = 100): FluxService {
  return {
    getFlux: vi.fn(async () => ({ flux, userId: 'user-1' })),
    updateStripeCustomerId: vi.fn(),
  } as any
}

function createMockLlmRouter(impl?: Partial<LlmRouterService>): LlmRouterService {
  return {
    invalidateConfig: vi.fn(),
    invalidateTtsVoicesCache: vi.fn(async () => undefined),
    listTtsVoices: vi.fn(async () => []),
    // Default: forward to globalThis.fetch so existing chat tests that mock
    // fetch keep working. Per-test overrides can replace `route` directly.
    route: vi.fn(async ({ abortSignal, body, modelName }) => {
      return globalThis.fetch('http://mock-gateway/chat/completions', {
        body: JSON.stringify({ ...body, model: modelName }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: abortSignal,
      })
    }),
    // TTS default also forwards to fetch, against a stable path tests can
    // assert on. The mocked response body becomes the audio payload.
    routeTts: vi.fn(async ({ abortSignal, input, modelName }) => {
      return globalThis.fetch('http://mock-gateway/audio/speech', {
        body: JSON.stringify({ input: input.text, model: modelName, voice: input.voice }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: abortSignal,
      })
    }),
    ...impl,
  } as LlmRouterService
}

// NOTE: a router-mock helper used to live here but was removed because the
// existing route tests all exercise the legacy fetch path (llmRouter = null).
// Router internals are exhaustively covered in
// server/apps/api/src/services/llm-router/router.test.ts (15 tests). Add a
// router-injecting helper here when route-level routing tests are introduced.

function createMockLlmTracing() {
  return {
    startChatGeneration: vi.fn((): ChatGenerationTrace => ({
      appendStreamChunk: vi.fn(),
      fail: vi.fn(),
      succeed: vi.fn(),
    })),
    startTtsGeneration: vi.fn((): TtsGenerationTrace => ({
      fail: vi.fn(),
      succeed: vi.fn(),
    })),
  }
}

function createMockProductEventService(): ProductEventService {
  return {
    track: vi.fn(async () => undefined),
    trackGeneration: vi.fn(async () => undefined),
  }
}

function createMockProviderCatalogService(impl?: Partial<ProviderCatalogService>): ProviderCatalogService {
  let syncedAliasRoutes: Array<{
    aliasId: string
    createdAt: Date
    displayOrder: number
    enabled: boolean
    id: string
    pool: 'fallback' | 'primary'
    routerModelId: string
    updatedAt: Date
    weight: number
  }> = []
  let syncedModels: Awaited<ReturnType<ProviderCatalogService['syncTtsModelsFromRouterConfig']>> = []
  const syncedVoicesByModel = new Map<string, Awaited<ReturnType<ProviderCatalogService['syncTtsVoices']>>>()

  return {
    assertTtsModelEnabled: vi.fn(async routerModelId => ({
      createdAt: new Date(),
      displayName: routerModelId,
      displayOrder: 0,
      enabled: true,
      id: 'tts-model-1',
      lastSyncedAt: null,
      provider: 'azure',
      routerModelId,
      updatedAt: new Date(),
    })),
    assertTtsVoiceEnabled: vi.fn(async (_routerModelId, providerVoiceId) => ({
      createdAt: new Date(),
      displayName: providerVoiceId,
      displayOrder: 0,
      enabled: true,
      id: 'tts-voice-1',
      labels: {},
      languages: [],
      lastSyncedAt: null,
      previewAudioUrl: null,
      providerVoiceId,
      source: 'provider-sync',
      ttsModelId: 'tts-model-1',
      updatedAt: new Date(),
    })),
    getTtsVoiceWithModel: vi.fn(async () => null),
    listAliases: vi.fn(async () => []),
    listEnabledTtsModels: vi.fn(async () => syncedModels),
    listEnabledTtsVoices: vi.fn(async routerModelId => syncedVoicesByModel.get(routerModelId) ?? []),
    listTtsModels: vi.fn(async () => []),
    listTtsVoices: vi.fn(async () => []),
    resolveEnabledAlias: vi.fn(async (surface, aliasId) => ({
      aliasId,
      createdAt: new Date(),
      displayName: aliasId,
      displayOrder: 0,
      enabled: true,
      fallbackEnabled: true,
      id: `alias-${aliasId}`,
      loadBalancingEnabled: false,
      routes: aliasId === 'auto'
        ? (syncedAliasRoutes.length > 0
            ? syncedAliasRoutes
            : [{
                aliasId: 'alias-auto',
                createdAt: new Date(),
                displayOrder: 0,
                enabled: true,
                id: 'alias-route-auto',
                pool: 'primary',
                routerModelId: 'openai/gpt-5-mini',
                updatedAt: new Date(),
                weight: 1,
              }])
        : [{
            aliasId: `alias-${aliasId}`,
            createdAt: new Date(),
            displayOrder: 0,
            enabled: true,
            id: `alias-route-${aliasId}`,
            pool: 'primary',
            routerModelId: aliasId,
            updatedAt: new Date(),
            weight: 1,
          }],
      surface,
      updatedAt: new Date(),
    })),
    syncAliasesFromRouterConfig: vi.fn(async (input: Parameters<ProviderCatalogService['syncAliasesFromRouterConfig']>[0]) => {
      const { modelIds, surface } = input
      syncedAliasRoutes = Array.from(new Set(modelIds)).map((routerModelId, index) => ({
        aliasId: 'alias-auto',
        createdAt: new Date(),
        displayOrder: index,
        enabled: true,
        id: `alias-route-${index}`,
        pool: 'primary',
        routerModelId,
        updatedAt: new Date(),
        weight: 1,
      }))
      return [{
        aliasId: 'auto',
        createdAt: new Date(),
        displayName: 'Auto',
        displayOrder: 0,
        enabled: true,
        fallbackEnabled: true,
        id: 'alias-auto',
        loadBalancingEnabled: false,
        surface,
        updatedAt: new Date(),
      }]
    }),
    syncTtsModelsFromRouterConfig: vi.fn(async (input: Parameters<ProviderCatalogService['syncTtsModelsFromRouterConfig']>[0]) => {
      const { models } = input
      syncedModels = Object.entries(models).sort(([a], [b]) => a.localeCompare(b)).map(([routerModelId, model], index) => ({
        createdAt: new Date(),
        displayName: routerModelId,
        displayOrder: index,
        enabled: true,
        id: `tts-model-${index}`,
        lastSyncedAt: new Date(),
        provider: model.provider,
        routerModelId,
        updatedAt: new Date(),
      }))
      return syncedModels
    }),
    syncTtsVoices: vi.fn(async (input: Parameters<ProviderCatalogService['syncTtsVoices']>[0]) => {
      const { routerModelId, voices } = input
      const syncedVoices = voices.map((voice, index) => ({
        createdAt: new Date(),
        displayName: voice.name ?? voice.id,
        displayOrder: index,
        enabled: true,
        id: `tts-voice-${index}`,
        labels: voice.labels ?? {},
        languages: voice.languages ?? [],
        lastSyncedAt: new Date(),
        previewAudioUrl: voice.previewAudioUrl ?? null,
        providerVoiceId: voice.id,
        source: 'provider-sync' as const,
        ttsModelId: 'tts-model-1',
        updatedAt: new Date(),
      }))
      syncedVoicesByModel.set(routerModelId, syncedVoices)
      return syncedVoices
    }),
    ...impl,
  } as ProviderCatalogService
}

function createMockRequestLogService(): RequestLogService {
  return {
    logRequest: vi.fn(async () => undefined),
  }
}

function createMockTtsMeter(unitsPerFlux = 1000) {
  let debt = 0
  return {
    accumulate: vi.fn(async ({ currentBalance, units }: { currentBalance: number, units: number }) => {
      debt += units
      const fluxDebited = Math.floor(debt / unitsPerFlux)
      debt -= fluxDebited * unitsPerFlux
      return { balanceAfter: currentBalance - fluxDebited, debtAfter: debt, fluxDebited }
    }),
    assertCanAfford: vi.fn(async (_userId: string, newUnits: number, currentBalance: number) => {
      const projectedFlux = Math.floor((debt + newUnits) / unitsPerFlux)
      const required = Math.max(projectedFlux, currentBalance <= 0 ? 1 : 0)
      if (currentBalance < required)
        throw new ApiError(402, 'PAYMENT_REQUIRED', 'Insufficient flux')
    }),
    config: { debtTtlSeconds: 86400, name: 'tts', unitsPerFlux },
    peekDebt: vi.fn(async () => debt),
  } as any
}

function createMockVoicePackService(impl?: Partial<VoicePackService>): VoicePackService {
  return {
    create: vi.fn(),
    disable: vi.fn(),
    findById: vi.fn(async () => null),
    findEnabledByVoiceId: vi.fn(async () => null),
    list: vi.fn(async () => []),
    listEnabled: vi.fn(async () => []),
    update: vi.fn(),
    ...impl,
  } as unknown as VoicePackService
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
  const { audioRoutes, openaiRoutes } = createV1Routes({
    billingService: billingService ?? createMockBillingService(),
    configKV,
    fluxService,
    genAi: null,
    llmRouter: llmRouter ?? createMockLlmRouter(),
    llmTracing,
    productEventService,
    providerCatalogService,
    rateLimitMetrics: null,
    requestLogService: requestLogService ?? createMockRequestLogService(),
    revenue: null,
    ttsMeter: ttsMeter ?? createMockTtsMeter(),
    voicePackService,
  })
  const app = new Hono<HonoEnv>()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        details: err.details,
        error: err.errorCode,
        message: err.message,
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

const testUser = { email: 'test@example.com', id: 'user-1', name: 'Test User' }

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
        body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'auto' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
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
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          choices: [{ message: { content: 'ok', role: 'assistant' } }],
          id: 'chatcmpl-test',
          usage: { completion_tokens: 1, prompt_tokens: 1 },
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
            body: JSON.stringify({ messages: [{ content: `hi ${i}`, role: 'user' }], model: 'auto' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          { user: testUser } as any,
        )
        expect(res.status).toBe(200)
      }

      const limited = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [{ content: 'blocked', role: 'user' }], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        choices: [{ message: { content: 'hi' } }],
        id: 'chatcmpl-partial',
        usage: { completion_tokens: 18000, prompt_tokens: 20000 },
      })
      globalThis.fetch = vi.fn(async () => new Response(upstreamBody, {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))

      // Balance 5 passes the gate when fallbackRate is 5 (matching schema default),
      // but the per-token cost lands at ceil(38000/1000 * 1) = 38 → partial debit.
      const fluxService = createMockFluxService(5)
      const billingService = createMockBillingService(5)
      const requestLogService = createMockRequestLogService()
      const app = createTestApp(
        fluxService,
        createMockConfigKV({ FLUX_PER_1K_TOKENS: 1, FLUX_PER_REQUEST: 5 }),
        billingService,
        requestLogService,
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      // Caller asked for 38 (token-based cost), mock-billing returns charged=5.
      expect(billingService.consumeFluxForLLM).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 38 }),
      )
      expect(requestLogService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({ fluxConsumed: 5, userId: 'user-1' }),
      )
    })

    it('should proxy upstream response on success', async () => {
      const upstreamBody = JSON.stringify({ choices: [{ message: { content: 'hello' } }], id: 'chatcmpl-1' })
      globalThis.fetch = vi.fn(async () => new Response(upstreamBody, {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))

      const fluxService = createMockFluxService(100)
      const billingService = createMockBillingService(100)
      const configKV = createMockConfigKV()
      const app = createTestApp(fluxService, configKV, billingService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { id: string }
      expect(data.id).toBe('chatcmpl-1')

      expect(billingService.consumeFluxForLLM).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1, userId: 'user-1' }),
      )

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"model":"openai/gpt-5-mini"'),
          method: 'POST',
        }),
      )
    })

    it('resolves "auto" model through the capability alias catalog', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
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
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [], model: 'openai/gpt-5-mini' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          body: JSON.stringify({ messages: [], model: 'deepseek' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        return new Response(JSON.stringify({ choices: [], usage: { completion_tokens: 1, prompt_tokens: 1 } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      })
      const now = new Date()
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => ({
          aliasId: 'auto',
          createdAt: now,
          displayName: 'Auto',
          displayOrder: 0,
          enabled: true,
          fallbackEnabled: true,
          id: 'alias-auto',
          loadBalancingEnabled: false,
          routes: [
            { aliasId: 'alias-auto', createdAt: now, displayOrder: 0, enabled: true, id: 'route-primary', pool: 'primary' as const, routerModelId: 'openai/primary', updatedAt: now, weight: 1 },
            { aliasId: 'alias-auto', createdAt: now, displayOrder: 1, enabled: true, id: 'route-fallback', pool: 'fallback' as const, routerModelId: 'openai/fallback', updatedAt: now, weight: 1 },
          ],
          surface: 'llm' as const,
          updatedAt: now,
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_CHAT_MODEL: 'openai/primary',
          LLM_ROUTER_CONFIG: {
            llm: { models: { 'openai/fallback': { upstreams: [] }, 'openai/primary': { upstreams: [] } } },
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
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          aliasId: 'auto',
          createdAt: now,
          displayName: 'Auto',
          displayOrder: 0,
          enabled: true,
          fallbackEnabled: false,
          id: 'alias-auto',
          loadBalancingEnabled: false,
          routes: [
            { aliasId: 'alias-auto', createdAt: now, displayOrder: 0, enabled: true, id: 'route-primary', pool: 'primary' as const, routerModelId: 'openai/primary', updatedAt: now, weight: 1 },
            { aliasId: 'alias-auto', createdAt: now, displayOrder: 1, enabled: true, id: 'route-fallback', pool: 'fallback' as const, routerModelId: 'openai/fallback', updatedAt: now, weight: 1 },
          ],
          surface: 'llm' as const,
          updatedAt: now,
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_CHAT_MODEL: 'openai/primary',
          LLM_ROUTER_CONFIG: {
            llm: { models: { 'openai/fallback': { upstreams: [] }, 'openai/primary': { upstreams: [] } } },
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
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        return new Response(JSON.stringify({ choices: [], usage: { completion_tokens: 1, prompt_tokens: 1 } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      })
      const now = new Date()
      const providerCatalogService = createMockProviderCatalogService({
        resolveEnabledAlias: vi.fn(async () => ({
          aliasId: 'auto',
          createdAt: now,
          displayName: 'Auto',
          displayOrder: 0,
          enabled: true,
          fallbackEnabled: false,
          id: 'alias-auto',
          loadBalancingEnabled: true,
          routes: [
            { aliasId: 'alias-auto', createdAt: now, displayOrder: 0, enabled: true, id: 'route-a', pool: 'primary' as const, routerModelId: 'openai/light', updatedAt: now, weight: 1 },
            { aliasId: 'alias-auto', createdAt: now, displayOrder: 1, enabled: true, id: 'route-b', pool: 'primary' as const, routerModelId: 'openai/heavy', updatedAt: now, weight: 9 },
          ],
          surface: 'llm' as const,
          updatedAt: now,
        })),
      })
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
          DEFAULT_CHAT_MODEL: 'openai/light',
          LLM_ROUTER_CONFIG: {
            llm: { models: { 'openai/heavy': { upstreams: [] }, 'openai/light': { upstreams: [] } } },
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
            body: JSON.stringify({ messages: [], model: 'auto' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
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

    it('records Langfuse and PostHog generations with authoritative usage and correlation', async () => {
      const llmRouter = createMockLlmRouter({
        route: vi.fn(async (_req, ctx) => {
          if (ctx) {
            ctx.provider = 'openrouter'
            ctx.upstreamModel = 'openai/gpt-4o-mini'
          }
          return new Response(JSON.stringify({
            choices: [],
            usage: { completion_tokens: 2, prompt_tokens: 1, total_tokens: 3 },
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          })
        }) as any,
      })
      const llmTracing = createMockLlmTracing()
      const productEventService = createMockProductEventService()
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        llmRouter,
        llmTracing,
        productEventService,
      )

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'chat-auto' }),
          headers: {
            [AIRI_CHAT_APP_SURFACE_HEADER]: 'electron',
            [AIRI_CHAT_ROUND_ID_HEADER]: 'round-1',
            [AIRI_CHAT_SESSION_ID_HEADER]: 'conversation-1',
            'Content-Type': 'application/json',
          },
          method: 'POST',
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
      expect(productEventService.trackGeneration).toHaveBeenCalledWith({
        appSurface: 'electron',
        captureSurface: 'server',
        conversationId: 'conversation-1',
        conversationIdSource: 'client_header',
        costUsdSource: 'unavailable',
        generationId: 'round-1',
        inputTokens: 1,
        latencySeconds: expect.any(Number),
        model: 'openai/gpt-4o-mini',
        outputTokens: 2,
        provider: 'openrouter',
        providerType: 'official',
        roundId: 'round-1',
        stream: false,
        totalTokens: 3,
        traceId: 'conversation-1',
        usageSource: 'reported',
        userId: 'user-1',
      })
    })

    it('uses request-level correlation for server-captured generations without chat headers', async () => {
      const llmRouter = createMockLlmRouter({
        route: vi.fn(async (_req, ctx) => {
          if (ctx) {
            ctx.provider = 'openrouter'
            ctx.upstreamModel = 'openai/gpt-4o-mini'
          }
          return new Response(JSON.stringify({
            choices: [],
            usage: { completion_tokens: 2, prompt_tokens: 1, total_tokens: 3 },
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          })
        }) as any,
      })
      const productEventService = createMockProductEventService()
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

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'chat-auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(productEventService.trackGeneration).toHaveBeenCalledWith({
        captureSurface: 'server',
        conversationId: expect.any(String),
        conversationIdSource: 'server_request',
        costUsdSource: 'unavailable',
        generationId: expect.any(String),
        inputTokens: 1,
        latencySeconds: expect.any(Number),
        model: 'openai/gpt-4o-mini',
        outputTokens: 2,
        provider: 'openrouter',
        providerType: 'official',
        roundId: expect.any(String),
        stream: false,
        totalTokens: 3,
        traceId: expect.any(String),
        usageSource: 'reported',
        userId: 'user-1',
      })
      const generation = vi.mocked(productEventService.trackGeneration).mock.calls[0]?.[0]
      expect(generation?.traceId).toBe(generation?.conversationId)
      expect(generation?.roundId).toBe(generation?.generationId)
      expect(generation).not.toHaveProperty('appSurface')
    })

    it('should not charge flux when upstream returns error', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"error":"bad"}', {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }))

      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(100), createMockConfigKV(), billingService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(503)
    })

    it('writes a synchronous llm_request_log entry after a successful debit', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))

      const requestLogService = createMockRequestLogService()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, requestLogService)

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [], model: 'gpt-4' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(requestLogService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          fluxConsumed: 1,
          model: 'gpt-4',
          status: 200,
          userId: 'user-1',
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
        headers: { 'Content-Type': 'text/event-stream' },
        status: 200,
      }))

      const billingService = createMockBillingService(100)
      const requestLogService = createMockRequestLogService()
      const app = createTestApp(createMockFluxService(100), createMockConfigKV(), billingService, requestLogService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }], model: 'auto', stream: true }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
      }))

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_TTS_MODEL: 'tts-1-hd' }),
      )

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({ input: 'test', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          body: JSON.stringify({ input: 'test', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          body: JSON.stringify({ input: 'test', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
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
            costMultiplier: 1.5,
            createdAt: new Date(),
            description: null,
            enabled: true,
            id: 'vp-azure',
            model: 'microsoft/v1',
            name: 'Azure',
            params: { pitch: 20, rate: 1.2, volume: 5 },
            provider: 'azure',
            ttsModelId: 'microsoft/v1',
            updatedAt: new Date(),
            upstreamVoiceId: 'en-US-AvaMultilingualNeural',
            voiceId: 'friendly-azure',
          })),
        }),
      )

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({
            input: 'test',
            model: 'voice-pack',
            voice: 'friendly-azure',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(routeTts).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            extraOptions: {
              pitch: 20,
              volume: 5,
            },
            speed: 1.2,
            text: 'test',
            voice: 'en-US-AvaMultilingualNeural',
          }),
          modelName: 'microsoft/v1',
        }),
        expect.any(Object),
      )
    })

    it('should bill per character with minimum charge', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
      }))

      const billingService = createMockBillingService(100)
      // Debt ledger: short input below unitsPerFlux accumulates without debit.
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService)

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({ input: 'hello', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
      }))

      const ttsMeter = createMockTtsMeter()
      const voicePackService = createMockVoicePackService({
        findEnabledByVoiceId: vi.fn(async () => ({
          costMultiplier: 2,
          createdAt: new Date(),
          description: null,
          enabled: true,
          id: 'vp-premium',
          model: 'microsoft/v1',
          name: 'Premium',
          params: {},
          provider: 'azure',
          ttsModelId: 'tts-1',
          updatedAt: new Date(),
          upstreamVoiceId: 'upstream-alloy',
          voiceId: 'alloy',
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
          body: JSON.stringify({
            input: 'hello',
            model: 'auto',
            voice: 'alloy',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(ttsMeter.assertCanAfford).toHaveBeenCalledWith('user-1', 10, 100)
      expect(ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({
          costMultiplier: 2,
        }),
        units: 10,
      }))
    })

    /**
     * @example
     * POST /api/v1/audio/speech { "voice": "alloy" }
     */
    it('routes TTS requests with Voice Pack metadata', async () => {
      const routeTts = vi.fn(async () => new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
      }))

      const productEventService = createMockProductEventService()
      const llmRouter = createMockLlmRouter({ routeTts })
      const voicePackService = createMockVoicePackService({
        findEnabledByVoiceId: vi.fn(async () => ({
          costMultiplier: 2,
          createdAt: new Date(),
          description: null,
          enabled: true,
          id: 'vp-premium',
          model: 'microsoft/v1',
          name: 'Premium',
          params: {},
          provider: 'azure',
          ttsModelId: 'tts-1',
          updatedAt: new Date(),
          upstreamVoiceId: 'upstream-alloy',
          voiceId: 'alloy',
        })),
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
        voicePackService,
      )

      const response = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({
            extra_body: {
              airi_analytics: {
                source: 'manual_preview',
                voice_type: 'official_selected',
              },
            },
            input: 'hello',
            model: 'auto',
            voice: 'alloy',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(response.status).toBe(200)
      expect(routeTts).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          text: 'hello',
          voice: 'upstream-alloy',
        }),
        modelName: 'tts-1',
      }), expect.any(Object))
      expect(productEventService.track).not.toHaveBeenCalled()
    })

    it('should not charge when routeTts upstream returns error', async () => {
      const llmRouter = createMockLlmRouter({
        routeTts: vi.fn(async () => new Response('{"error":"service down"}', {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        })) as any,
      })
      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({ input: 'hello', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
    it('preserves routeTts ApiError status and reason', async () => {
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
          body: JSON.stringify({ input: 'hello', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(429)
    })

    it('returns 402 for manual TTS when flux is insufficient', async () => {
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
          body: JSON.stringify({ input: 'hello', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(402)
      expect(llmRouter.routeTts).not.toHaveBeenCalled()
    })

    it('returns 204 for auto TTS when flux is insufficient', async () => {
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
          body: JSON.stringify({
            extra_body: {
              airi_analytics: {
                source: 'chat_auto_tts',
                trigger: 'auto',
              },
            },
            input: 'hello',
            model: 'auto',
            voice: 'alloy',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(204)
      expect(llmRouter.routeTts).not.toHaveBeenCalled()
    })

    it('should not charge when input is empty', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
      }))

      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService)

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({ input: '', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      // Debt ledger: empty input adds 0 units, no debit triggered.
      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    it('should charge proportionally for long input', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
      }))

      const billingService = createMockBillingService(100)
      const ttsMeter = createMockTtsMeter()
      // Mock meter unitsPerFlux = 1000, input = 2500 chars → debit 2 Flux, 500 dust.
      const longInput = 'a'.repeat(2500)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService, undefined, ttsMeter)

      await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({ input: longInput, model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )

      expect(ttsMeter.accumulate).toHaveBeenCalledWith(
        expect.objectContaining({ units: 2500, userId: 'user-1' }),
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
    // After patch (server/apps/api/src/routes/openai/v1/index.ts:471-493):
    // `accumulate()` + `span.setAttribute()` are wrapped in try/finally,
    // span.end() runs unconditionally, and the error propagates to the
    // global handler. recordRequestLog is still skipped (we can't log a
    // billing-failed request without a fluxConsumed value), but the
    // failure is now observable instead of hidden by a leaked span.
    it('tTS billing failure closes the span and surfaces error to onError (regression)', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        headers: { 'Content-Type': 'audio/mpeg' },
        status: 200,
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
          body: JSON.stringify({ input: 'hi', model: 'auto', voice: 'en-US-AvaMultilingualNeural' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
          headers: { 'Content-Type': 'application/json' },
          status: 502,
        })) as any,
      })

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
          body: JSON.stringify({ input: 'hi', model: 'auto', voice: 'alloy' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
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
            createdAt: new Date(),
            displayName: 'alibaba/cosyvoice-v2',
            displayOrder: 0,
            enabled: true,
            id: 'tts-model-aliyun',
            lastSyncedAt: null,
            provider: 'dashscope-cosyvoice',
            routerModelId: 'alibaba/cosyvoice-v2',
            updatedAt: new Date(),
          },
          {
            createdAt: new Date(),
            displayName: 'microsoft/v1',
            displayOrder: 1,
            enabled: true,
            id: 'tts-model-azure',
            lastSyncedAt: null,
            provider: 'azure',
            routerModelId: 'microsoft/v1',
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
                'alibaba/cosyvoice-v2': { provider: 'dashscope-cosyvoice', upstreams: [] as unknown[] },
                'microsoft/v1': { provider: 'azure', upstreams: [] as unknown[] },
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
      const data = await res.json() as { default: string, models: { id: string, name: string }[] }
      expect(data.models.map(m => m.id)).toEqual([
        'voice-pack',
        'alibaba/cosyvoice-v2',
        'microsoft/v1',
      ])
      expect(data.models[0]).toMatchObject({
        description: 'Server-curated voices',
        id: 'voice-pack',
        name: 'Voice Pack',
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
        description: 'Server-curated voices',
        id: 'voice-pack',
        name: 'Voice Pack',
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
              defaultModel: 'volcengine/seed-tts-2.0',
              keys: [{ ciphertext: 'enc', id: 'k1' }],
              models: [
                { description: 'TTS 2.0', id: 'volcengine/seed-tts-2.0', name: 'Volcengine Seed-TTS 2.0' },
                { id: 'volcengine/seed-tts-1.0' },
              ],
            },
          },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { available: boolean, default: null | string, models: { description?: string, id: string, name: string }[] }
      expect(data.available).toBe(true)
      expect(data.models).toEqual([
        { description: 'TTS 2.0', id: 'volcengine/seed-tts-2.0', name: 'Volcengine Seed-TTS 2.0' },
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
              keys: [{ ciphertext: 'enc', id: 'k1' }],
              models: [{ id: 'volcengine/seed-tts-2.0', name: 'Vol' }],
            },
          },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      const data = await res.json() as { default: null | string }
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
              keys: [{ ciphertext: 'enc', id: 'k1' }],
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
        { gender: 'Female', id: 'en-US-JennyNeural', locale: 'en-US', name: 'Jenny', previewAudioUrl: 'https://example.com/jenny.mp3', provider: 'azure' },
        { gender: 'Female', id: 'en-US-AvaMultilingualNeural', locale: 'en-US', name: 'Ava', provider: 'azure' },
      ]
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => voices) as any,
      })
      const providerCatalogService = createMockProviderCatalogService({
        listEnabledTtsVoices: vi.fn(async () => [
          {
            createdAt: new Date(),
            displayName: 'Jenny',
            displayOrder: 0,
            enabled: true,
            id: 'tts-voice-jenny',
            labels: {},
            languages: [],
            lastSyncedAt: null,
            previewAudioUrl: 'https://example.com/jenny.mp3',
            providerVoiceId: 'en-US-JennyNeural',
            source: 'provider-sync',
            ttsModelId: 'tts-model-azure',
            updatedAt: new Date(),
          },
          {
            createdAt: new Date(),
            displayName: 'Ava',
            displayOrder: 1,
            enabled: true,
            id: 'tts-voice-ava',
            labels: {},
            languages: [],
            lastSyncedAt: null,
            previewAudioUrl: null,
            providerVoiceId: 'en-US-AvaMultilingualNeural',
            source: 'provider-sync',
            ttsModelId: 'tts-model-azure',
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
      const data = await res.json() as { recommended: Record<string, string>, voices: Array<Record<string, unknown>> }
      expect(data.voices[0]).toEqual({
        id: 'en-US-JennyNeural',
        labels: {},
        languages: [],
        name: 'Jenny',
        preview_audio_url: 'https://example.com/jenny.mp3',
      })
      expect(data.voices[1]).toMatchObject({
        id: 'en-US-AvaMultilingualNeural',
        labels: {},
        languages: [],
        name: 'Ava',
      })
      expect(data.voices[1]).not.toHaveProperty('preview_audio_url')
      expect(data.recommended).toEqual({ 'en-US': 'en-US-AvaMultilingualNeural' })
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })

    it('lists enabled Voice Packs from the Voice Pack model without upstream details', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => [
          { id: 'en-US-AvaMultilingualNeural', languages: [{ code: 'en-US', title: 'English' }], name: 'Ava' },
        ]) as any,
      })
      const voicePackService = createMockVoicePackService({
        listEnabled: vi.fn(async () => [
          {
            costMultiplier: 2,
            createdAt: new Date(),
            description: 'Warm voice',
            enabled: true,
            id: 'vp-1',
            model: 'microsoft/v1',
            name: 'Narrator',
            params: {},
            provider: 'azure',
            ttsModelId: 'microsoft/v1',
            updatedAt: new Date(),
            upstreamVoiceId: 'en-US-AvaMultilingualNeural',
            voiceId: 'narrator-alias',
          },
          {
            costMultiplier: 1,
            createdAt: new Date(),
            description: null,
            enabled: true,
            id: 'vp-other',
            model: 'cosyvoice-v1',
            name: 'Other model pack',
            params: {},
            provider: 'alibaba',
            ttsModelId: 'alibaba/cosyvoice-v1',
            updatedAt: new Date(),
            upstreamVoiceId: 'longxiaochun',
            voiceId: 'other-model-alias',
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
        description: 'Warm voice · Flux cost: 2x',
        id: 'narrator-alias',
        name: 'Narrator',
      })
      expect(data.voices[0]).not.toHaveProperty('upstreamVoiceId')
      expect(data.voices[0]).not.toHaveProperty('ttsModelId')
      expect(data.voices[1]).toMatchObject({ id: 'other-model-alias' })
      expect(llmRouter.listTtsVoices).not.toHaveBeenCalled()
    })

    it('does not mix Voice Packs into concrete model voice catalogs', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => [
          { id: 'en-US-AvaMultilingualNeural', languages: [{ code: 'en-US', title: 'English' }], name: 'Ava' },
        ]) as any,
      })
      const voicePackService = createMockVoicePackService({
        listEnabled: vi.fn(async () => [{
          costMultiplier: 2,
          createdAt: new Date(),
          description: 'Warm voice',
          enabled: true,
          id: 'vp-1',
          model: 'microsoft/v1',
          name: 'Narrator',
          params: {},
          provider: 'azure',
          ttsModelId: 'microsoft/v1',
          updatedAt: new Date(),
          upstreamVoiceId: 'en-US-AvaMultilingualNeural',
          voiceId: 'narrator-alias',
        }]),
      })
      const providerCatalogService = createMockProviderCatalogService({
        listEnabledTtsVoices: vi.fn(async () => [{
          createdAt: new Date(),
          displayName: 'Ava',
          displayOrder: 0,
          enabled: true,
          id: 'tts-voice-ava',
          labels: {},
          languages: [{ code: 'en-US', title: 'English' }],
          lastSyncedAt: null,
          previewAudioUrl: null,
          providerVoiceId: 'en-US-AvaMultilingualNeural',
          source: 'provider-sync',
          ttsModelId: 'tts-model-azure',
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
          labels: {},
          languages: [{ code: 'en-US', title: 'English' }],
          name: 'Ava',
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
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })) as any
    }

    function mockUnspeechFailure(status: number, body = 'boom') {
      globalThis.fetch = vi.fn(async () => new Response(body, { status })) as any
    }

    it('returns the streaming-model bucket of DEFAULT_TTS_VOICES when ?model= matches', async () => {
      mockUnspeechVoices([{ id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0' }])
      const configKV = createMockConfigKV({
        DEFAULT_TTS_VOICES: {
          'seed-tts-1.0': { 'zh-cn': 'should-not-leak' },
          'seed-tts-2.0': { 'zh-cn': 'zh_female_vv_uranus_bigtts' },
        },
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ ciphertext: 'enc', id: 'k1' }] } },
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
        DEFAULT_TTS_VOICES: { 'seed-tts-2.0': { 'zh-cn': 'x' } },
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ ciphertext: 'enc', id: 'k1' }] } },
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
        DEFAULT_TTS_VOICES: { 'seed-tts-2.0': { 'zh-cn': 'x' } },
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ ciphertext: 'enc', id: 'k1' }] } },
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
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ ciphertext: 'enc', id: 'k1' }] } },
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
        UNSPEECH_UPSTREAM: { restBaseURL: 'http://unspeech.local:5933', streaming: { baseURL: 'ws://unspeech.local:5933/v1/audio/speech/stream', keys: [{ ciphertext: 'enc', id: 'k1' }] } },
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
          body: JSON.stringify({ messages: [], model: 'auto' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })
  })
})
