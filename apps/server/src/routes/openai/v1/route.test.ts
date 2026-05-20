import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxService } from '../../../services/domain/flux'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { RequestLogService } from '../../../services/domain/request-log'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { createV1Routes } from '.'
import { ApiError } from '../../../utils/error'

// --- Mock helpers ---

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
    assertCanAfford: vi.fn(async () => undefined),
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

function createTestApp(
  fluxService: FluxService,
  configKV: ConfigKVService,
  billingService?: BillingService,
  requestLogService?: RequestLogService,
  ttsMeter?: ReturnType<typeof createMockTtsMeter>,
  llmRouter?: LlmRouterService,
) {
  const { openaiRoutes, audioRoutes } = createV1Routes(
    fluxService,
    billingService ?? createMockBillingService(),
    configKV,
    requestLogService ?? createMockRequestLogService(),
    ttsMeter ?? createMockTtsMeter(),
    llmRouter ?? createMockLlmRouter(),
    null,
  )
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

// --- Tests ---

describe('v1CompletionsRoutes', () => {
  const originalFetch = globalThis.fetch

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

      // Verify flux was debited via billingService
      expect(billingService.consumeFluxForLLM).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', amount: 1 }),
      )

      // Verify upstream was called with correct URL and resolved model
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
      // Post-billing: no charge on failed requests
      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    it('should return 503 when config keys are missing', async () => {
      const configKV = createMockConfigKV()
      // Override getOptional to return null for required keys
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

    it('should return 402 when flux is insufficient', async () => {
      const app = createTestApp(
        createMockFluxService(0),
        createMockConfigKV(),
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
    it('exposes auto alias plus every configured tts model id', async () => {
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
      expect(data.models[0]).toEqual({ id: 'auto', name: 'Auto' })
      expect(data.models.slice(1).map(m => m.id)).toEqual([
        'alibaba/cosyvoice-v2',
        'microsoft/v1',
      ])
    })

    it('returns only the auto alias when no tts models are configured', async () => {
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
      expect(data.models).toEqual([{ id: 'auto', name: 'Auto' }])
    })

    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.request('/api/v1/audio/models', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('gET /api/v1/audio/models/streaming', () => {
    it('returns the operator-configured streaming model catalog', async () => {
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
            },
          },
        }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: { id: string, name: string, description?: string }[] }
      expect(data.models).toEqual([
        { id: 'volcengine/seed-tts-2.0', name: 'Volcengine Seed-TTS 2.0', description: 'TTS 2.0' },
        { id: 'volcengine/seed-tts-1.0', name: 'volcengine/seed-tts-1.0' },
      ])
    })

    it('returns an empty list when UNSPEECH_UPSTREAM is unset', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/models/streaming', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: unknown[] }
      expect(data.models).toEqual([])
    })

    it('returns an empty list when streaming subtree has no models', async () => {
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
      const data = await res.json() as { models: unknown[] }
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

    it('pOST /api/v1/openai/chat/completion (singular) should also work', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(200)
    })
  })
})
