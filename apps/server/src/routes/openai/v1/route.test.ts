import type { Env } from '../../../libs/env'
import type { BillingService } from '../../../services/billing/billing-service'
import type { ConfigKVService } from '../../../services/config-kv'
import type { FluxService } from '../../../services/flux'
import type { RequestLogService } from '../../../services/request-log'
import type { HonoEnv } from '../../../types/hono'

import { Buffer } from 'node:buffer'

import { Hono } from 'hono'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { createV1CompletionsRoutes } from '.'
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
      balance -= input.amount
      return { userId: input.userId, flux: balance }
    }),
    creditFlux: vi.fn(),
    creditFluxFromStripeCheckout: vi.fn(),
    creditFluxFromInvoice: vi.fn(),
  } as any
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    GATEWAY_BASE_URL: 'http://mock-gateway/',
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
    DEFAULT_TTS_MODEL: 'tts-1',
    ...overrides,
  } as Env
}

function createMockConfigKV(overrides: Record<string, any> = {}): ConfigKVService {
  const defaults: Record<string, any> = {
    FLUX_PER_REQUEST: 1,
    FLUX_PER_1K_CHARS_TTS: 2,
    TTS_DEBT_TTL_SECONDS: 86400,
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

function createMockRedis() {
  const store = new Map<string, Buffer>()
  return {
    get: vi.fn(async (key: string) => {
      const v = store.get(key)
      return v ? v.toString('utf8') : null
    }),
    getBuffer: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string | Buffer) => {
      store.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'))
      return 'OK'
    }),
    _store: store,
  }
}

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

function createTestApp(
  fluxService: FluxService,
  configKV: ConfigKVService,
  billingService?: BillingService,
  requestLogService?: RequestLogService,
  ttsMeter?: ReturnType<typeof createMockTtsMeter>,
  env?: Env,
  redis?: ReturnType<typeof createMockRedis>,
) {
  const routes = createV1CompletionsRoutes(
    fluxService,
    billingService ?? createMockBillingService(),
    configKV,
    requestLogService ?? createMockRequestLogService(),
    ttsMeter ?? createMockTtsMeter(),
    (redis ?? createMockRedis()) as any,
    env ?? createMockEnv(),
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

  app.route('/api/v1/openai', routes)
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
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        createMockEnv({ DEFAULT_CHAT_MODEL: 'anthropic/claude-sonnet' }),
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

  describe('pOST /api/v1/openai/audio/speech', () => {
    it('should proxy TTS request to upstream with resolved model', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        createMockEnv({ DEFAULT_TTS_MODEL: 'tts-1-hd' }),
      )

      await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/speech', {
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
        new Request('http://localhost/api/v1/openai/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', input: 'hello', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(billingService.consumeFluxForLLM).not.toHaveBeenCalled()
    })

    it('should not charge when upstream returns error', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"error":"service down"}', {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }))

      const billingService = createMockBillingService(100)
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), billingService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/voices', { method: 'GET' }),
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
        new Request('http://localhost/api/v1/openai/audio/speech', {
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
        new Request('http://localhost/api/v1/openai/audio/speech', {
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
        new Request('http://localhost/api/v1/openai/audio/speech', {
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

      const res = await app.request('/api/v1/openai/audio/voices', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('should forward gateway error status', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"error":"bad"}', {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/voices', { method: 'GET' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(502)
    })
  })

  describe('gET /api/v1/openai/audio/models', () => {
    it('exposes only the auto routing alias regardless of DEFAULT_TTS_MODEL', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        undefined,
        undefined,
        undefined,
        createMockEnv({ DEFAULT_TTS_MODEL: 'microsoft/v1' }),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: { id: string, name: string }[] }
      expect(data.models).toEqual([{ id: 'auto', name: 'Auto' }])
    })

    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.request('/api/v1/openai/audio/models', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('gET /api/v1/openai/audio/voices', () => {
    it('should proxy voice list from gateway', async () => {
      const voicesResponse = { voices: [
        { id: 'en-US-JennyNeural', name: 'Jenny', provider: 'MICROSOFT_SPEECH_SERVICE_V1', locale: 'en-US', gender: 'Female' },
        { id: 'alloy', name: 'Alloy', provider: 'OPEN_AI', locale: '', gender: '' },
      ] }
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(voicesResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/voices', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as typeof voicesResponse
      expect(data.voices).toHaveLength(2)
      expect(data.voices[0].id).toBe('en-US-JennyNeural')

      const [calledUrl, calledInit] = (globalThis.fetch as any).mock.calls[0]
      expect(String(calledUrl)).toBe('http://mock-gateway/audio/voices?model=tts-1')
      expect(calledInit).toMatchObject({ method: 'GET' })
    })

    it('serves the second request from Redis without re-hitting the gateway', async () => {
      const voicesResponse = { voices: [{ id: 'alloy', name: 'Alloy' }] }
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(voicesResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      const redis = createMockRedis()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, undefined, redis)

      await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices'), { user: testUser } as any)
      await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices'), { user: testUser } as any)

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      expect(redis.set).toHaveBeenCalledTimes(1)
    })

    it('stores the cached body gzipped (first two bytes are the gzip magic)', async () => {
      // Big payload so gzip actually compresses below plain json size. Using
      // a single-voice body would hit the gzip header overhead and be larger.
      const voices = Array.from({ length: 200 }, (_, i) => ({
        id: `voice-${i}`,
        name: `Voice ${i}`,
        description: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaozhenNeural)',
      }))
      const voicesResponse = { voices }
      const rawJson = JSON.stringify(voicesResponse)
      globalThis.fetch = vi.fn(async () => new Response(rawJson, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      const redis = createMockRedis()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, undefined, redis)

      await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices'), { user: testUser } as any)

      const stored = redis._store.get('tts:voices:upstream:tts-1')
      expect(stored).toBeDefined()
      expect(stored![0]).toBe(0x1F)
      expect(stored![1]).toBe(0x8B)
      expect(stored!.length).toBeLessThan(rawJson.length)
    })

    it('transparently reads legacy plain-JSON cache entries left over from before compression', async () => {
      globalThis.fetch = vi.fn()
      const redis = createMockRedis()
      redis._store.set(
        'tts:voices:upstream:tts-1',
        Buffer.from(JSON.stringify({ voices: [{ id: 'legacy', name: 'Legacy' }] }), 'utf8'),
      )
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, undefined, redis)

      const res = await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices'), { user: testUser } as any)
      const data = await res.json() as { voices: { id: string }[] }

      expect(data.voices).toEqual([{ id: 'legacy', name: 'Legacy' }])
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('caches per-model — different models each hit the gateway once', async () => {
      const fetchMock = vi.fn(async (url: any) => new Response(
        JSON.stringify({ voices: [{ id: `${new URL(url).searchParams.get('model')}-v` }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))
      globalThis.fetch = fetchMock as any
      const redis = createMockRedis()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, undefined, undefined, undefined, redis)

      await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices?model=tts-1'), { user: testUser } as any)
      await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices?model=tts-hd'), { user: testUser } as any)
      await app.fetch(new Request('http://localhost/api/v1/openai/audio/voices?model=tts-1'), { user: testUser } as any)

      expect(fetchMock).toHaveBeenCalledTimes(2)
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
