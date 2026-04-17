import { describe, expect, it } from 'vitest'

import { parseEnv } from '../env'

/**
 * Minimum env required for `parseEnv` to succeed.
 *
 * Use when:
 * - Constructing the smallest valid input for default-coverage tests
 *
 * Expects:
 * - Only the strictly-required (`pipe(string(), nonEmpty(...))`) fields are populated
 *
 * Returns:
 * - Record passed straight to `parseEnv`
 */
function minimalRequiredEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgres://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'test-secret',
    AUTH_GOOGLE_CLIENT_ID: 'gid',
    AUTH_GOOGLE_CLIENT_SECRET: 'gsec',
    AUTH_GITHUB_CLIENT_ID: 'ghid',
    AUTH_GITHUB_CLIENT_SECRET: 'ghsec',
    GATEWAY_BASE_URL: 'http://localhost:18080',
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
    DEFAULT_TTS_MODEL: 'microsoft/v1',
  }
}

describe('parseEnv', () => {
  describe('RESEND_FROM_EMAIL default', () => {
    it('falls back to noreply@airi.moeru.ai when not set', () => {
      // @example RESEND_FROM_EMAIL is omitted entirely from input
      const result = parseEnv(minimalRequiredEnv())
      expect(result.RESEND_FROM_EMAIL).toBe('noreply@airi.moeru.ai')
    })

    it('preserves operator-supplied RESEND_FROM_EMAIL verbatim', () => {
      // @example RESEND_FROM_EMAIL is set to a custom branded sender
      const result = parseEnv({
        ...minimalRequiredEnv(),
        RESEND_FROM_EMAIL: 'hello@brand.example.com',
      })
      expect(result.RESEND_FROM_EMAIL).toBe('hello@brand.example.com')
    })
  })
})
