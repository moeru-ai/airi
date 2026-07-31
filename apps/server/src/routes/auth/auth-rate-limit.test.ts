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

async function listen(app: Hono<HonoEnv>) {
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
  const port = await new Promise<number>((resolve) => {
    server.once('listening', () => {
      const address = server.address()
      if (address && typeof address === 'object')
        resolve(address.port)
    })
  })

  return {
    origin: `http://127.0.0.1:${port}`,
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

  it('uses the forwarded client IP behind a custom-domain gateway', async () => {
    // ROOT CAUSE: proxy trust was inferred from API_SERVER_URL, so moving the
    // public custom domain to Caddy disabled X-Real-IP and merged every
    // anonymous caller into the Caddy replica's socket-address bucket.
    // AFTER: proxy trust is an explicit deployment setting rather than being
    // inferred from the externally visible URL.
    const server = await listen(await createApp('railway'))

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
