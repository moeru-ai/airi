import { describe, expect, it } from 'vitest'

import { parseAdditionalTrustedOriginsEnv, parseEnv } from './env'

function baseEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://example',
    REDIS_URL: 'redis://example',
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    AUTH_GOOGLE_CLIENT_ID: 'google-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
    AUTH_GITHUB_CLIENT_ID: 'github-client',
    AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    GATEWAY_BASE_URL: 'http://localhost:18080',
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
    DEFAULT_TTS_MODEL: 'microsoft/v1',
  }
}

describe('parseAdditionalTrustedOriginsEnv', () => {
  it('normalizes comma-separated origins and dedupes', () => {
    expect(parseAdditionalTrustedOriginsEnv('')).toEqual([])
    expect(parseAdditionalTrustedOriginsEnv(' https://10.0.0.129:5273/ , https://198.18.0.1:5273 ')).toEqual([
      'https://10.0.0.129:5273',
      'https://198.18.0.1:5273',
    ])
    expect(parseAdditionalTrustedOriginsEnv('https://x.test:5273/,https://x.test:5273')).toEqual([
      'https://x.test:5273',
    ])
  })

  it('throws on invalid segments', () => {
    expect(() => parseAdditionalTrustedOriginsEnv('not-a-url')).toThrow(/invalid URL origin segment/)
  })
})

describe('parseEnv', () => {
  it('parses the required auth and infrastructure environment variables', () => {
    const env = parseEnv(baseEnv())

    expect(env.DATABASE_URL).toBe('postgres://example')
    expect(env.REDIS_URL).toBe('redis://example')
    expect(env.ADDITIONAL_TRUSTED_ORIGINS).toEqual([])
  })

  it('parses ADDITIONAL_TRUSTED_ORIGINS into a normalized origin list', () => {
    const env = parseEnv({
      ...baseEnv(),
      ADDITIONAL_TRUSTED_ORIGINS: 'https://10.0.0.129:5273/, https://198.18.0.1:5273',
    })

    expect(env.ADDITIONAL_TRUSTED_ORIGINS).toEqual([
      'https://10.0.0.129:5273',
      'https://198.18.0.1:5273',
    ])
  })
})
