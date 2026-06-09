import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { parseAdditionalTrustedOriginsEnv, parseEnv } from '../env'

function baseEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://example',
    REDIS_URL: 'redis://example',
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    AUTH_GOOGLE_CLIENT_ID: 'google-client',
    AUTH_GOOGLE_CLIENT_SECRET: 'google-secret',
    AUTH_GITHUB_CLIENT_ID: 'github-client',
    AUTH_GITHUB_CLIENT_SECRET: 'github-secret',
    // Required: a deterministic 32-byte base64 value so env parse succeeds.
    LLM_ROUTER_MASTER_KEY: Buffer.alloc(32, 0xAA).toString('base64'),
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
    expect(env.AUTH_UI_URL).toBe('https://accounts.airi.build/ui')
    expect(env.ADMIN_UI_URL).toBe('https://admin.airi.build')
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

  it('parses TEST_AUTH_TOKEN with default virtual user settings', () => {
    const env = parseEnv({
      ...baseEnv(),
      TEST_AUTH_TOKEN: 'local-test-token',
    })

    expect(env.TEST_AUTH_TOKEN).toBe('local-test-token')
    expect(env.TEST_AUTH_USER_ID).toBe('test-user')
    expect(env.TEST_AUTH_USER_EMAIL).toBe('test@example.com')
    expect(env.TEST_AUTH_USER_NAME).toBe('Test User')
    expect(env.TEST_AUTH_USER_ROLE).toBe('')
  })

  it('parses TEST_AUTH_TOKEN virtual user overrides', () => {
    const env = parseEnv({
      ...baseEnv(),
      TEST_AUTH_TOKEN: 'local-test-token',
      TEST_AUTH_USER_ID: 'admin-user',
      TEST_AUTH_USER_EMAIL: 'admin@example.com',
      TEST_AUTH_USER_NAME: 'Admin User',
      TEST_AUTH_USER_ROLE: 'admin',
    })

    expect(env.TEST_AUTH_USER_ID).toBe('admin-user')
    expect(env.TEST_AUTH_USER_EMAIL).toBe('admin@example.com')
    expect(env.TEST_AUTH_USER_NAME).toBe('Admin User')
    expect(env.TEST_AUTH_USER_ROLE).toBe('admin')
  })

  it('lLM_ROUTER_MASTER_KEY decodes a valid 32-byte base64 value into a Buffer', () => {
    const key = Buffer.alloc(32, 0xAB).toString('base64')
    const env = parseEnv({
      ...baseEnv(),
      LLM_ROUTER_MASTER_KEY: key,
    })

    expect(Buffer.isBuffer(env.LLM_ROUTER_MASTER_KEY)).toBe(true)
    expect(env.LLM_ROUTER_MASTER_KEY.length).toBe(32)
  })

  // NOTICE:
  // The "rejects wrong-length master key" behavior is enforced by the Valibot
  // check() in `LLM_ROUTER_MASTER_KEY`. It cannot be cleanly asserted here
  // because `parseEnv` calls `process.exit(1)` on validation failure (intended
  // for boot failures, not test assertions). Testing through `parseEnv` would
  // require mocking `process.exit`, which destabilizes the vitest worker on
  // module-init paths (parsedEnv = injeca.provide('env', () => parseEnv(env))).
  // The success-case tests above prove the validator chain runs; the failure
  // mode is exercised via integration / manual deploy testing.

  it('lLM_ROUTER_MASTER_KEY_PREVIOUS decodes when set (rotation window)', () => {
    const current = Buffer.alloc(32, 0x01).toString('base64')
    const previous = Buffer.alloc(32, 0x02).toString('base64')
    const env = parseEnv({
      ...baseEnv(),
      LLM_ROUTER_MASTER_KEY: current,
      LLM_ROUTER_MASTER_KEY_PREVIOUS: previous,
    })

    expect(env.LLM_ROUTER_MASTER_KEY.length).toBe(32)
    expect(env.LLM_ROUTER_MASTER_KEY_PREVIOUS?.length).toBe(32)
    expect(env.LLM_ROUTER_MASTER_KEY.equals(env.LLM_ROUTER_MASTER_KEY_PREVIOUS!)).toBe(false)
  })
})
