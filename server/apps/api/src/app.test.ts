import { describe, expect, it, vi } from 'vitest'

import { buildApp } from './app'

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
    billingService: {} as never,
    characterService: {} as never,
    chatService: {} as never,
    configKV: { getOrThrow: vi.fn() } as never,
    db: { query: { user: { findFirst: vi.fn() } } } as never,
    env: {
      API_SERVER_URL: 'https://api.airi.build',
      AUTH_SERVER_URL: 'https://api.airi.build',
    } as never,
    envelopeCrypto: {
      decryptKey: vi.fn(),
      encryptKey: vi.fn(),
    } as never,
    fluxService: {} as never,
    fluxTransactionService: {} as never,
    llmRouter: {
      invalidateConfig: vi.fn(),
      route: vi.fn(async () => new Response('{}', { status: 200 })),
    } as never,
    otel: null,
    productEventService: {
      track: vi.fn(async () => undefined),
      trackGeneration: vi.fn(async () => undefined),
    } as never,
    providerCatalogService: {} as never,
    providerService: {} as never,
    redis: redis as never,
    requestLogService: {} as never,
    stripeService: {} as never,
    ttsMeter: {} as never,
    userDeletionService: { register: vi.fn(), softDeleteAll: vi.fn() },
    voicePackService: {} as never,
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
})
