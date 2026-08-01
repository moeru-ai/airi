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
    stripeService: {} as never,
    billingService: {} as never,
    adminFluxGrantsService: {} as never,
    adminRouterConfigService: {} as never,
    adminUsersService: {} as never,
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
      AUTH_INTERNAL_SECRET: 'shared-secret',
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
