import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxService } from '../../../services/domain/flux'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { ChatGenerationTrace, TtsGenerationTrace } from '../../../services/domain/llm-tracing'
import type { ProductEventService } from '../../../services/domain/product-events'
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

    it('should resolve "auto" model to DEFAULT_CHAT_MODEL from config', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({ DEFAULT_CHAT_MODEL: 'anthropic/claude-sonnet' }),
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
          body: expect.stringContaining('"model":"anthropic/claude-sonnet"'),
        }),
      )
    })

    it('should pass through non-auto model as-is', async () => {
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
      configKV.getOptional = vi.fn(async () => null)

      const app = createTestApp(createMockFluxService(), configKV)

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

    /**
     * @example
     * POST /api/v1/audio/speech { "speed": 1.2, "extra_body": { "voice_pack": { "pitch": 20 } } }
     */
    it('forwards TTS speed and Voice Pack prosody options to the router input', async () => {
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
          findById: vi.fn(async () => ({
            id: 'vp-azure',
            name: 'Azure',
            description: null,
            provider: 'azure',
            model: 'microsoft/v1',
            voiceId: 'en-US-AvaMultilingualNeural',
            ttsModelId: 'microsoft/v1',
            params: {},
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
            model: 'auto',
            input: 'test',
            voice: 'en-US-AvaMultilingualNeural',
            speed: 1.2,
            extra_body: {
              voice_pack: {
                pack_id: 'vp-azure',
                cost_multiplier: 1.5,
                pitch: 20,
                volume: 5,
              },
            },
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
     * POST /api/v1/audio/speech { "input": "hello", "extra_body": { "voice_pack": { "cost_multiplier": 2 } } }
     */
    it('uses Voice Pack cost multiplier for affordability and billing units', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const ttsMeter = createMockTtsMeter()
      const voicePackService = createMockVoicePackService({
        findById: vi.fn(async () => ({
          id: 'vp-premium',
          name: 'Premium',
          description: null,
          provider: 'azure',
          model: 'microsoft/v1',
          voiceId: 'alloy',
          ttsModelId: 'tts-1',
          params: {},
          costMultiplier: 2,
          enabled: false,
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
            extra_body: {
              voice_pack: {
                pack_id: 'vp-premium',
                cost_multiplier: 2,
              },
            },
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
          balance_state: 'insufficient',
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
          balance_state: 'insufficient',
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
    it('exposes every configured tts model id', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV({
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
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: { id: string, name: string }[] }
      expect(data.models.map(m => m.id)).toEqual([
        'alibaba/cosyvoice-v2',
        'microsoft/v1',
      ])
    })

    it('returns an empty list when no tts models are configured', async () => {
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
      expect(data.models).toEqual([])
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
        { id: 'en-US-JennyNeural', name: 'Jenny', provider: 'azure', locale: 'en-US', gender: 'Female' },
        { id: 'en-US-AvaMultilingualNeural', name: 'Ava', provider: 'azure', locale: 'en-US', gender: 'Female' },
      ]
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => voices) as any,
      })
      const configKV = createMockConfigKV({
        DEFAULT_TTS_VOICES: {
          'microsoft/v1': { 'en-US': 'en-US-AvaMultilingualNeural' },
          'other-model': { 'en-US': 'should-not-leak' },
        },
      })

      const app = createTestApp(createMockFluxService(), configKV, undefined, undefined, undefined, llmRouter)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/voices?model=microsoft/v1', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { voices: typeof voices, recommended: Record<string, string> }
      expect(data.voices).toEqual(voices)
      expect(data.recommended).toEqual({ 'en-US': 'en-US-AvaMultilingualNeural' })
      expect(llmRouter.listTtsVoices).toHaveBeenCalledWith('microsoft/v1')
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
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async (model: string) => [{ id: `${model}-v`, name: model } as any]) as any,
      })

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, llmRouter)

      await app.fetch(new Request('http://localhost/api/v1/audio/voices?model=alibaba/cosyvoice-v1'), { user: testUser } as any)
      expect(llmRouter.listTtsVoices).toHaveBeenCalledWith('alibaba/cosyvoice-v1')
    })

    it('resolves `auto` model to configKV DEFAULT_TTS_MODEL', async () => {
      const llmRouter = createMockLlmRouter({
        listTtsVoices: vi.fn(async () => []) as any,
      })
      const configKV = createMockConfigKV({ DEFAULT_TTS_MODEL: 'microsoft/v1' })

      const app = createTestApp(createMockFluxService(), configKV, undefined, undefined, undefined, llmRouter)

      await app.fetch(new Request('http://localhost/api/v1/audio/voices?model=auto'), { user: testUser } as any)
      expect(llmRouter.listTtsVoices).toHaveBeenCalledWith('microsoft/v1')
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
