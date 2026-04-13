import { describe, expect, it, vi } from 'vitest'

import { buildApp } from './app'

function createTestDeps() {
  const authServerMetadata = {
    issuer: 'http://localhost:3000/api/auth',
    authorization_endpoint: 'http://localhost:3000/api/auth/oauth2/authorize',
    token_endpoint: 'http://localhost:3000/api/auth/oauth2/token',
  }

  const openIdConfig = {
    issuer: 'http://localhost:3000/api/auth',
    jwks_uri: 'http://localhost:3000/api/auth/jwks',
    authorization_endpoint: 'http://localhost:3000/api/auth/oauth2/authorize',
    token_endpoint: 'http://localhost:3000/api/auth/oauth2/token',
  }

  const auth = {
    api: {
      getSession: vi.fn(async () => null),
      getOAuthServerConfig: vi.fn(async () => authServerMetadata),
      getOpenIdConfig: vi.fn(async () => openIdConfig),
    },
    handler: vi.fn(async () => new Response('not-found', { status: 404 })),
  } as any

  const redisSubscriber = {
    on: vi.fn(),
    subscribe: vi.fn(async () => 1),
    unsubscribe: vi.fn(async () => 0),
  }

  const redis = {
    duplicate: vi.fn(() => redisSubscriber),
    publish: vi.fn(async () => 0),
  }

  const deps = {
    auth,
    db: {} as any,
    characterService: {} as any,
    chatService: {} as any,
    providerService: {} as any,
    fluxService: {} as any,
    fluxTransactionService: {} as any,
    stripeService: {} as any,
    billingService: {} as any,
    billingMq: {} as any,
    configKV: {
      getOrThrow: vi.fn(async (key: string) => {
        switch (key) {
          case 'AUTH_RATE_LIMIT_MAX':
            return 20
          case 'AUTH_RATE_LIMIT_WINDOW_SEC':
            return 60
          default:
            throw new Error(`Unexpected config key: ${key}`)
        }
      }),
    } as any,
    redis: redis as any,
    env: {
      API_SERVER_URL: 'http://localhost:3000',
    } as any,
    otel: null,
  }

  return {
    deps,
    auth,
    authServerMetadata,
    openIdConfig,
    redis,
  }
}

describe('app well-known metadata routes', () => {
  it('serves oauth authorization server metadata at the root well-known path', async () => {
    const { deps, auth, authServerMetadata } = createTestDeps()
    const { app } = await buildApp(deps)

    const res = await app.request('/.well-known/oauth-authorization-server/api/auth')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual(authServerMetadata)
    expect(auth.api.getOAuthServerConfig).toHaveBeenCalledTimes(1)
    expect(auth.api.getOpenIdConfig).not.toHaveBeenCalled()
  })

  it('serves openid configuration at the issuer-appended well-known path', async () => {
    const { deps, auth, openIdConfig } = createTestDeps()
    const { app } = await buildApp(deps)

    const res = await app.request('/api/auth/.well-known/openid-configuration')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual(openIdConfig)
    expect(auth.api.getOpenIdConfig).toHaveBeenCalledTimes(1)
    expect(auth.api.getOAuthServerConfig).not.toHaveBeenCalled()
  })
})
