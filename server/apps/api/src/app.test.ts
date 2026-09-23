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
    db: { query: { user: { findFirst: vi.fn() } } } as never,
    characterService: {} as never,
    chatService: {} as never,
    providerService: {} as never,
    fluxService: {} as never,
    fluxTransactionService: {} as never,
    paymentService: {} as never,
    stripe: null,
    billingService: {} as never,
    ttsMeter: {} as never,
    requestLogService: {} as never,
    voicePackService: {} as never,
    providerCatalogService: {} as never,
    productEventService: {
      track: vi.fn(async () => undefined),
    } as never,
    configKV: { getOrThrow: vi.fn(), getOptional: vi.fn(async () => 1) } as never,
    redis: redis as never,
    env: {
      API_SERVER_URL: 'https://api.airi.build',
      AUTH_SERVER_URL: 'https://api.airi.build',
      TEST_AUTH_TOKEN: 'test-token',
      TEST_AUTH_USER_ID: 'user-1',
      TEST_AUTH_USER_EMAIL: 'test@example.com',
      TEST_AUTH_USER_NAME: 'Test User',
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

  // ROOT CAUSE:
  //
  // The former global 1 MiB limit ran before the Responses route's auth
  // guard, so it both rejected supported inline media and inspected a large
  // unauthenticated body before returning 401.
  it('authenticates a large Responses request before applying its route limit', async () => {
    const { app } = await buildApp(createTestDeps())
    const response = await app.request('/api/v1/openai/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ' '.repeat(1024 * 1024 + 1),
    })

    expect(response.status).toBe(401)
  })

  it('allows an authenticated Responses body beyond the default API limit', async () => {
    const { app } = await buildApp(createTestDeps())
    const response = await app.request('/api/v1/openai/responses', {
      method: 'POST',
      headers: { 'authorization': 'Bearer test-token', 'Content-Type': 'application/json' },
      body: ' '.repeat(1024 * 1024 + 1),
    })

    expect(response.status).toBe(400)
  })
})
