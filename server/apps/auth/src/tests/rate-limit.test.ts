import type { HonoEnv } from '../routes'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAuthRoutes } from '../routes'

async function createApp(trustedProxy?: 'railway') {
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
  it('uses one fixed 20-request bucket when proxy trust is disabled', async () => {
    const server = await listen(await createApp())

    try {
      for (let index = 0; index < 20; index += 1)
        expect((await request(server.origin, `203.0.113.${index + 1}`)).status).toBe(200)

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
      for (let index = 0; index < 20; index += 1)
        expect((await request(server.origin, '203.0.113.10')).status).toBe(200)

      expect((await request(server.origin, '203.0.113.10')).status).toBe(429)
      expect((await request(server.origin, '203.0.113.11')).status).toBe(200)
    }
    finally {
      await server.close()
    }
  })
})
