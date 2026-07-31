import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { HonoEnv } from '../../types/hono'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAuthRoutes } from '.'

function createConfigKV(): ConfigKVService {
  const values: Record<string, number> = {
    AUTH_RATE_LIMIT_MAX: 1,
    AUTH_RATE_LIMIT_WINDOW_SEC: 60,
  }

  return {
    get: vi.fn(async (key: string) => values[key]),
    getOrThrow: vi.fn(async (key: string) => values[key]),
    getOptional: vi.fn(async (key: string) => values[key] ?? null),
    set: vi.fn(),
  } as any
}

async function createApp(trustedProxy?: 'railway') {
  const routes = await createAuthRoutes({
    auth: {
      handler: vi.fn(async () => new Response(null, { status: 200 })),
      api: { getSession: vi.fn(async () => null) },
    } as any,
    db: {} as any,
    env: {
      API_SERVER_URL: 'https://api.airi.build',
      AUTH_UI_URL: 'https://accounts.airi.build/ui',
      ADDITIONAL_TRUSTED_ORIGINS: [],
      RATE_LIMIT_TRUSTED_PROXY: trustedProxy,
    } as any,
    configKV: createConfigKV(),
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
    // ROOT CAUSE: proxy trust was inferred from API_SERVER_URL, so moving the
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
})
