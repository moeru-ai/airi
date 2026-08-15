import type { AddressInfo } from 'node:net'

import WebSocket from 'ws'

import { serve } from '@hono/node-server'
import { describe, expect, it, vi } from 'vitest'

import { buildApp } from './app'
import { WS_CLOSE_UNAUTHORIZED } from './libs/ws-auth'

function createTestDeps() {
  const redisSubscriber = {
    on: vi.fn(),
    subscribe: vi.fn(async () => 1),
    unsubscribe: vi.fn(async () => 0),
  }
  const redis = {
    duplicate: vi.fn(() => redisSubscriber),
    publish: vi.fn(async () => 0),
  }

  return {
    db: { query: { user: { findFirst: vi.fn() } } } as never,
    characterService: {} as never,
    chatService: {} as never,
    providerService: {} as never,
    fluxService: {} as never,
    fluxTransactionService: {} as never,
    stripeService: {} as never,
    billingService: {} as never,
    ttsMeter: {} as never,
    requestLogService: {} as never,
    voicePackService: {} as never,
    providerCatalogService: {} as never,
    productEventService: {
      track: vi.fn(async () => undefined),
      trackGeneration: vi.fn(async () => undefined),
      countDistinctUsersByFeature: vi.fn(async () => []),
    } as never,
    configKV: { getOrThrow: vi.fn() } as never,
    redis: redis as never,
    env: {
      API_SERVER_URL: 'https://api.airi.build',
      AUTH_SERVER_URL: 'https://api.airi.build',
      TEST_AUTH_TOKEN: 'test-token',
      TEST_AUTH_USER_EMAIL: 'test@example.com',
      TEST_AUTH_USER_ID: 'test-user',
      TEST_AUTH_USER_NAME: 'Test User',
      TEST_AUTH_USER_ROLE: 'user',
    } as never,
    otel: null,
    userDeletionService: { register: vi.fn(), softDeleteAll: vi.fn() },
    llmRouter: {
      route: vi.fn(async () => new Response('{}', { status: 200 })),
      invalidateConfig: vi.fn(),
    } as never,
    envelopeCrypto: {
      encryptKey: vi.fn(),
      decryptKey: vi.fn(),
    } as never,
  }
}

describe('business API app', () => {
  it('does not expose management routes', async () => {
    const { app } = await buildApp(createTestDeps())

    expect((await app.request('/admin')).status).toBe(404)
    expect((await app.request('/admin/users')).status).toBe(404)
    expect((await app.request('/api/admin/metrics')).status).toBe(404)
    expect((await app.request('/api/admin/graphql', { method: 'POST' })).status).toBe(404)
  })

  it('does not expose Better Auth or OIDC provider routes', async () => {
    const { app } = await buildApp(createTestDeps())

    expect((await app.request('/api/auth/get-session')).status).toBe(404)
    expect((await app.request('/api/auth/.well-known/openid-configuration')).status).toBe(404)
    expect((await app.request('/.well-known/oauth-authorization-server/api/auth')).status).toBe(404)
  })

  it('identifies itself as the resource API', async () => {
    const { app } = await buildApp(createTestDeps())
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ service: 'airi-api' })
  })

  it('does not expose the legacy ASR streaming POST route', async () => {
    const { app } = await buildApp(createTestDeps())

    expect((await app.request('/api/v1/audio/transcriptions/stream', {
      headers: { Authorization: 'Bearer test-token' },
      method: 'POST',
    })).status).toBe(404)
  })

  it('requires a valid query token for the ASR WebSocket', async () => {
    const { app, injectWebSocket } = await buildApp(createTestDeps())
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
    injectWebSocket(server)
    await new Promise<void>((resolve) => {
      if (server.listening)
        resolve()
      else
        server.once('listening', resolve)
    })
    const { port } = server.address() as AddressInfo

    try {
      const unauthorized = new WebSocket(`ws://127.0.0.1:${port}/api/v1/audio/transcriptions/ws`)
      const unauthorizedCode = await new Promise<number>((resolve) => {
        unauthorized.once('close', resolve)
      })
      expect(unauthorizedCode).toBe(WS_CLOSE_UNAUTHORIZED)

      const authorized = new WebSocket(`ws://127.0.0.1:${port}/api/v1/audio/transcriptions/ws?token=test-token`)
      await new Promise<void>((resolve, reject) => {
        authorized.once('open', resolve)
        authorized.once('error', reject)
      })
      authorized.close(1000, 'test_complete')
      await new Promise<void>(resolve => authorized.once('close', () => resolve()))
    }
    finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
