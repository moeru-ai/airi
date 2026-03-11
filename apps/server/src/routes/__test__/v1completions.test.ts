import type { ConfigKVService } from '../../services/config-kv'
import type { FluxService } from '../../services/flux'
import type { RequestLogService } from '../../services/request-log'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../utils/error'
import { createV1CompletionsRoutes } from '../v1completions'

// --- Mock helpers ---

function createMockFluxService(flux = 100): FluxService {
  return {
    getFlux: vi.fn(async () => ({ userId: 'user-1', flux })),
    consumeFlux: vi.fn(async (_userId: string, amount: number) => ({ userId: 'user-1', flux: flux - amount })),
    addFlux: vi.fn(async (_userId: string, amount: number) => ({ userId: 'user-1', flux: flux + amount })),
    updateStripeCustomerId: vi.fn(),
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

function createMockRequestLogService(): RequestLogService {
  return {
    logRequest: vi.fn(async () => {}),
  } as any
}

function createTestApp(
  fluxService: FluxService,
  configKV: ConfigKVService,
  requestLogService: RequestLogService,
) {
  const routes = createV1CompletionsRoutes(fluxService, configKV, requestLogService)
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

  app.route('/api/v1', routes)
  return app
}

const testUser = { id: 'user-1', name: 'Test User', email: 'test@example.com' }

// --- Tests ---

describe('v1CompletionsRoutes', () => {
  const originalFetch = globalThis.fetch

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  describe('pOST /api/v1/chat/completions', () => {
    it('should return 401 when unauthenticated', async () => {
      const app = createTestApp(
        createMockFluxService(),
        createMockConfigKV(),
        createMockRequestLogService(),
      )

      const res = await app.request('/api/v1/chat/completions', {
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
        createMockRequestLogService(),
      )

      const res = await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
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
      const configKV = createMockConfigKV({ GATEWAY_BASE_URL: 'http://mock-gateway/' })
      const requestLogService = createMockRequestLogService()
      const app = createTestApp(fluxService, configKV, requestLogService)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.id).toBe('chatcmpl-1')

      // Verify flux was consumed
      expect(fluxService.consumeFlux).toHaveBeenCalledWith('user-1', 1)

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
        createMockRequestLogService(),
      )

      await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
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

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), createMockRequestLogService())

      await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
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

      const fluxService = createMockFluxService(100)
      const app = createTestApp(fluxService, createMockConfigKV(), createMockRequestLogService())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )

      expect(res.status).toBe(500)
      // Post-billing: no charge on failed requests, no refund needed
      expect(fluxService.consumeFlux).not.toHaveBeenCalled()
      expect(fluxService.addFlux).not.toHaveBeenCalled()
    })

    it('should return 503 when config keys are missing', async () => {
      const configKV = createMockConfigKV()
      // Override getOptional to return null for required keys
      configKV.getOptional = vi.fn(async () => null)

      const app = createTestApp(createMockFluxService(), configKV, createMockRequestLogService())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'auto', messages: [] }),
        }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(503)
    })

    it('should log the request', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const requestLogService = createMockRequestLogService()
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), requestLogService)

      await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', {
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
  })

  describe('pOST /api/v1/audio/speech', () => {
    it('should proxy TTS request to upstream', async () => {
      const audioData = new Uint8Array([1, 2, 3, 4])
      globalThis.fetch = vi.fn(async () => new Response(audioData, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), createMockRequestLogService())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/speech', {
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

  describe('pOST /api/v1/audio/transcriptions', () => {
    it('should proxy transcription request to upstream', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"text":"hello"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), createMockRequestLogService())

      const formData = new FormData()
      formData.append('file', new Blob(['audio']), 'test.wav')
      formData.append('model', 'whisper-1')

      const res = await app.fetch(
        new Request('http://localhost/api/v1/audio/transcriptions', {
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

  describe('route matching', () => {
    it('gET /api/v1/chat/completions should return 404', async () => {
      const app = createTestApp(createMockFluxService(), createMockConfigKV(), createMockRequestLogService())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/chat/completions', { method: 'GET' }),
        { user: testUser } as any,
      )
      expect(res.status).toBe(404)
    })

    it('pOST /api/v1/chat/completion (singular) should also work', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

      const app = createTestApp(createMockFluxService(), createMockConfigKV(), createMockRequestLogService())

      const res = await app.fetch(
        new Request('http://localhost/api/v1/chat/completion', {
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
