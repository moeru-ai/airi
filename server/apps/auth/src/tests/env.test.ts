import { describe, expect, it } from 'vitest'

import { parseAuthEnv } from '../env'

function baseAuthEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://identity',
    REDIS_URL: 'redis://identity',
    PUBLIC_URL: 'https://api.airi.build',
    RESOURCE_SERVER_URL: 'https://resource.internal',
    BETTER_AUTH_SECRET: 'identity-secret-at-least-32-characters',
    AUTH_GOOGLE_CLIENT_ID: 'google-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
    AUTH_GITHUB_CLIENT_ID: 'github-client',
    AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
  }
}

describe('parseAuthEnv', () => {
  it('parses auth configuration without business-only LLM or Stripe secrets', () => {
    const env = parseAuthEnv(baseAuthEnv())

    expect(env.PUBLIC_URL).toBe('https://api.airi.build')
    expect(env.RESOURCE_SERVER_URL).toBe('https://resource.internal')
    expect(env.BETTER_AUTH_SECRET).toBe('identity-secret-at-least-32-characters')
    expect('LLM_ROUTER_MASTER_KEY' in env).toBe(false)
    expect('STRIPE_SECRET_KEY' in env).toBe(false)
    expect('TEST_AUTH_TOKEN' in env).toBe(false)
  })

  it('normalizes Apple audiences and escaped private-key newlines', () => {
    const env = parseAuthEnv({
      ...baseAuthEnv(),
      AUTH_APPLE_CLIENT_ID: 'apple-service-id',
      AUTH_APPLE_APP_BUNDLE_IDENTIFIERS: 'ai.moeru.airi-pocket, ai.moeru.airi-pro, ai.moeru.airi-pocket',
      AUTH_APPLE_TEAM_ID: 'apple-team-id',
      AUTH_APPLE_KEY_ID: 'apple-key-id',
      AUTH_APPLE_PRIVATE_KEY_PEM: 'line-one\\nline-two',
    })

    expect(env.AUTH_APPLE_APP_BUNDLE_IDENTIFIERS).toEqual([
      'ai.moeru.airi-pocket',
      'ai.moeru.airi-pro',
    ])
    expect(env.AUTH_APPLE_PRIVATE_KEY_PEM).toBe('line-one\nline-two')
  })

  it('keeps optional Apple authentication disabled by default', () => {
    const env = parseAuthEnv(baseAuthEnv())

    expect(env.AUTH_APPLE_CLIENT_ID).toBe('')
    expect(env.AUTH_APPLE_APP_BUNDLE_IDENTIFIERS).toEqual([])
    expect(env.AUTH_APPLE_TEAM_ID).toBe('')
    expect(env.AUTH_APPLE_KEY_ID).toBe('')
    expect(env.AUTH_APPLE_PRIVATE_KEY_PEM).toBe('')
  })

  it('parses the explicit Railway trusted-proxy boundary', () => {
    const env = parseAuthEnv({
      ...baseAuthEnv(),
      RATE_LIMIT_TRUSTED_PROXY: 'railway',
    })

    expect(env.RATE_LIMIT_TRUSTED_PROXY).toBe('railway')
  })

  it('normalizes trusted origins and parses database pool settings', () => {
    const env = parseAuthEnv({
      ...baseAuthEnv(),
      ADDITIONAL_TRUSTED_ORIGINS: 'https://desktop.test/, https://desktop.test, https://web.test:5273/',
      DB_POOL_MAX: '8',
    })

    expect(env.ADDITIONAL_TRUSTED_ORIGINS).toEqual([
      'https://desktop.test',
      'https://web.test:5273',
    ])
    expect(env.DB_POOL_MAX).toBe(8)
    expect(env.DB_POOL_IDLE_TIMEOUT_MS).toBe(30000)
  })
})
