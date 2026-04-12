import type { MqService } from '../../../libs/mq'
import type { BillingEvent } from '../../../services/billing/billing-events'
import type { BillingService } from '../../../services/billing/billing-service'
import type { ConfigKVService } from '../../../services/config-kv'
import type { FluxService } from '../../../services/flux'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { createV1CompletionsRoutes } from '.'
import { ApiError } from '../../../utils/error'
import { DEFAULT_BILLING_EVENTS_STREAM } from '../../../utils/redis-keys'

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

function createMockConfigKV(overrides: Record<string, any> = {}): ConfigKVService {
  const defaults: Record<string, any> = {
    FLUX_PER_REQUEST: 1,
    FLUX_PER_REQUEST_TTS: 1,
    FLUX_PER_REQUEST_ASR: 1,
    GATEWAY_BASE_URL: 'http://mock-gateway/',
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
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

function createMockBillingMq(): MqService<BillingEvent> {
  return {
    stream: DEFAULT_BILLING_EVENTS_STREAM,
    publish: vi.fn(async () => '1-0'),
    ensureConsumerGroup: vi.fn(async () => true),
    consume: vi.fn(async () => []),
    claimIdleMessages: vi.fn(async () => []),
    ack: vi.fn(async () => 1),
  } as any
}

function createTestApp(
  fluxService: FluxService,
  configKV: ConfigKVService,
  billingService?: BillingService,
  billingMq?: MqService<BillingEvent>,
) {
  const routes = createV1CompletionsRoutes(fluxService, billingService ?? createMockBillingService(), configKV, billingMq ?? createMockBillingMq(), null)
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
      const configKV = createMockConfigKV({ GATEWAY_BASE_URL: 'http://mock-gateway/' })
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

    it('should publish request log event via billingMq', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const billingMq = createMockBillingMq()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), undefined, billingMq)

      await app.fetch(
        new Request('http://localhost/api/v1/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(billingMq.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'llm.request.log',
          aggregateId: 'user-1',
          userId: 'user-1',
          payload: expect.objectContaining({
            model: 'gpt-4',
            status: 200,
            fluxConsumed: 1,
          }),
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
      const billingMq = createMockBillingMq()
      const app = createTestApp(createMockFluxService(100), createMockConfigKV(), billingService, billingMq)

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
      expect(billingMq.publish).not.toHaveBeenCalled()
    })
  })

  describe.skip('pOST /api/v1/openai/audio/speech', () => {
    it('should proxy TTS request to upstream', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4])
      globalThis.fetch = vi.fn(async () => new Response(audioData, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'tts-1', input: 'hello', voice: 'alloy' }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/audio/speech',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe.skip('pOST /api/v1/openai/audio/transcriptions', () => {
    it('should proxy transcription request to upstream', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"text":"hello"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const formData = new FormData()
      formData.append('file', new Blob(['audio']), 'test.wav')
      formData.append('model', 'whisper-1')

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/transcriptions', {
          method: 'POST',
          body: formData,
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://mock-gateway/audio/transcriptions',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('gET /api/v1/openai/audio/models', () => {
    it('should return configured TTS model from config', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV({ DEFAULT_TTS_MODEL: 'microsoft/v1' }))

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json() as { models: { id: string, name: string }[] }
      expect(data.models).toHaveLength(1)
      expect(data.models[0].id).toBe('microsoft/v1')
    })

    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV())

      const res = await app.request('/api/v1/openai/audio/models', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('should return 503 when DEFAULT_TTS_MODEL is not configured', async () => {
      const configKV = createMockConfigKV()
      configKV.getOptional = vi.fn(async (key: string) => {
        if (key === 'DEFAULT_TTS_MODEL')
          return null
        return (configKV as any).__defaults?.[key] ?? null
      })

      const app = createTestApp(createMockFluxService(), configKV)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/openai/audio/models', { method: 'GET' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(503)
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
