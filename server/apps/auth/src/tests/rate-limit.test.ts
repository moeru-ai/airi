import type Redis from 'ioredis'

import type { AuthConfigService } from '../rate-limit'
import type { HonoEnv } from '../routes'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { MemoryStore } from 'hono-rate-limiter'
import { describe, expect, it, vi } from 'vitest'

import { createAuthConfigService } from '../rate-limit'
import { createAuthRoutes } from '../routes'

function createAuthConfigHarness(values: Record<string, string | null>) {
  const handlers = new Map<string, Array<(...args: string[]) => void>>()
  const subscriber = {
    on: vi.fn((event: string, handler: (...args: string[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return subscriber
    }),
    subscribe: vi.fn(async () => 1),
    quit: vi.fn(async () => 'OK'),
    emit(event: string, ...args: string[]) {
      for (const handler of handlers.get(event) ?? [])
        handler(...args)
    },
  }
  const store = {
    getRaw: vi.fn(async (key: string) => values[key] ?? null),
    getFreshRaw: vi.fn(async (key: string) => values[key] ?? null),
    invalidateCache: vi.fn(async () => {}),
  }
  const logger = {
    withError: vi.fn(() => logger),
    warn: vi.fn(),
  }
  const redis = {
    duplicate: vi.fn(() => subscriber),
  } as unknown as Redis

  return {
    service: createAuthConfigService(store, redis, { logger: logger as never }),
    store,
    subscriber,
    values,
  }
}

describe('auth rate-limit config', () => {
  it('uses defaults when PostgreSQL rows are absent', async () => {
    expect(await createAuthConfigHarness({}).service.getRateLimit()).toEqual({ max: 20, windowSec: 60 })
  })

  it('reads both rate-limit values directly from PostgreSQL', async () => {
    const { service } = createAuthConfigHarness({
      AUTH_RATE_LIMIT_MAX: '40',
      AUTH_RATE_LIMIT_WINDOW_SEC: '120',
    })
    expect(await service.getRateLimit()).toEqual({ max: 40, windowSec: 120 })
  })

  it('rejects malformed stored values', async () => {
    const { service } = createAuthConfigHarness({ AUTH_RATE_LIMIT_MAX: '"forty"' })
    await expect(service.getRateLimit()).rejects.toMatchObject({ errorCode: 'CONFIG_INVALID' })
  })

  it('reloads both values after either key is invalidated', async () => {
    const harness = createAuthConfigHarness({
      AUTH_RATE_LIMIT_MAX: '20',
      AUTH_RATE_LIMIT_WINDOW_SEC: '60',
    })
    const listener = vi.fn()
    harness.service.onRateLimitChange(listener)
    await harness.service.start()

    harness.values.AUTH_RATE_LIMIT_MAX = '30'
    harness.values.AUTH_RATE_LIMIT_WINDOW_SEC = '90'
    harness.subscriber.emit('message', 'configkv:invalidate', JSON.stringify({
      key: 'AUTH_RATE_LIMIT_MAX',
      version: 1,
      publishedAt: Date.now(),
    }))
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ max: 30, windowSec: 90 }))
  })

  it('keeps the last valid config when a hot reload is invalid', async () => {
    const harness = createAuthConfigHarness({
      AUTH_RATE_LIMIT_MAX: '20',
      AUTH_RATE_LIMIT_WINDOW_SEC: '60',
    })
    const listener = vi.fn()
    harness.service.onRateLimitChange(listener)
    await harness.service.start()

    harness.values.AUTH_RATE_LIMIT_MAX = '0'
    harness.subscriber.emit('message', 'configkv:invalidate', JSON.stringify({
      key: 'AUTH_RATE_LIMIT_MAX',
      version: 2,
      publishedAt: Date.now(),
    }))

    await vi.waitFor(() => expect(harness.store.getFreshRaw).toHaveBeenCalledTimes(2))
    expect(listener).not.toHaveBeenCalled()
  })
})

function createAuthConfig(onChange?: (listener: Parameters<AuthConfigService['onRateLimitChange']>[0]) => void): AuthConfigService {
  return {
    getRateLimit: vi.fn(async () => ({ max: 1, windowSec: 60 })),
    onRateLimitChange: vi.fn((listener) => {
      onChange?.(listener)
      return () => true
    }),
    onStop: vi.fn(() => () => true),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  }
}

async function createApp(trustedProxy?: 'railway', authConfig = createAuthConfig()) {
  const routes = await createAuthRoutes({
    auth: {
      handler: vi.fn(async () => new Response(null, { status: 200 })),
      api: { getSession: vi.fn(async () => null) },
    } as unknown as Parameters<typeof createAuthRoutes>[0]['auth'],
    db: {} as unknown as Parameters<typeof createAuthRoutes>[0]['db'],
    env: {
      PUBLIC_URL: 'https://api.airi.build',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
      RATE_LIMIT_TRUSTED_PROXY: trustedProxy,
    } as unknown as Parameters<typeof createAuthRoutes>[0]['env'],
    authConfig,
    rateLimitMetrics: null,
  })

  return new Hono<HonoEnv>().route('/', routes)
}

async function listen(app: Hono<HonoEnv>, hostname = '127.0.0.1') {
  const server = serve({ fetch: app.fetch, port: 0, hostname })
  const port = await new Promise<number>((resolve) => {
    server.once('listening', () => {
      const address = server.address()
      if (address && typeof address === 'object')
        resolve(address.port)
    })
  })

  return {
    origin: `http://${hostname.includes(':') ? `[${hostname}]` : hostname}:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
  }
}

function request(origin: string, clientAddress: string) {
  return fetch(`${origin}/api/auth/get-session`, {
    headers: {
      'connection': 'close',
      'x-real-ip': clientAddress,
    },
  })
}

describe('auth API rate limiting behind Railway', () => {
  it('ignores forwarded client IPs unless proxy trust is explicitly enabled', async () => {
    const server = await listen(await createApp())

    try {
      expect((await request(server.origin, '203.0.113.20')).status).toBe(200)
      expect((await request(server.origin, '203.0.113.21')).status).toBe(429)
    }
    finally {
      await server.close()
    }
  })

  it('uses the forwarded client IP over an IPv6 gateway socket', async () => {
    // ROOT CAUSE: proxy trust was inferred from PUBLIC_URL, so moving the
    // public custom domain to Caddy first disabled X-Real-IP. The replacement
    // then allowed only IPv4 proxy sockets, while Railway connected Caddy to
    // ts-api over private IPv6, so callers still shared the Caddy socket bucket.
    // AFTER: the explicit deployment setting owns proxy trust; the middleware
    // validates X-Real-IP without coupling it to the proxy transport family.
    const server = await listen(await createApp('railway'), '::1')

    try {
      expect((await request(server.origin, '203.0.113.10')).status).toBe(200)
      expect((await request(server.origin, '203.0.113.11')).status).toBe(200)
      expect((await request(server.origin, '203.0.113.11')).status).toBe(429)
    }
    finally {
      await server.close()
    }
  })

  it('replaces the middleware, closes the old store, and resets buckets', async () => {
    let reload: Parameters<AuthConfigService['onRateLimitChange']>[0] | undefined
    const shutdown = vi.spyOn(MemoryStore.prototype, 'shutdown')
    const server = await listen(await createApp(undefined, createAuthConfig((listener) => {
      reload = listener
    })))

    try {
      expect((await request(server.origin, '203.0.113.20')).status).toBe(200)
      expect((await request(server.origin, '203.0.113.20')).status).toBe(429)

      await reload?.({ max: 2, windowSec: 120 })

      expect(shutdown).toHaveBeenCalledTimes(1)
      expect((await request(server.origin, '203.0.113.20')).status).toBe(200)
      expect((await request(server.origin, '203.0.113.20')).status).toBe(200)
      expect((await request(server.origin, '203.0.113.20')).status).toBe(429)
    }
    finally {
      shutdown.mockRestore()
      await server.close()
    }
  })
})
