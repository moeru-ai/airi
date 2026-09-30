import type { AuthDatabase } from '../db'
import type { EmailService } from '../email'

import { user } from '@proj-airi/auth-shared'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createAuth } from '../auth'
import { parseAuthEnv } from '../env'
import { createTestDatabase } from './mock-db'

const origin = 'http://localhost:3000'
const successUrl = `${origin}/auth/verify-email?verified=true`
let db: AuthDatabase

beforeAll(async () => {
  // PGlite implements the Drizzle operations used by the production Postgres adapter.
  db = await createTestDatabase() as unknown as AuthDatabase
})

/** Captures mail at the delivery boundary while exercising the real Auth HTTP handlers. */
function createFixture() {
  const email: EmailService = {
    send: vi.fn(),
    sendVerification: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendMagicLink: vi.fn(),
    sendChangeEmailConfirmation: vi.fn(),
    sendDeleteAccountVerification: vi.fn(),
  }
  const env = parseAuthEnv({
    PUBLIC_URL: origin,
    DATABASE_URL: 'postgres://unused',
    REDIS_URL: 'redis://unused',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    AUTH_GOOGLE_CLIENT_ID: 'test-google',
    AUTH_GOOGLE_CLIENT_SECRET: 'test-google-secret',
    AUTH_GITHUB_CLIENT_ID: 'test-github',
    AUTH_GITHUB_CLIENT_SECRET: 'test-github-secret',
  })
  return { auth: createAuth(db, env, email), email }
}

/** Sends a JSON request through the public Auth handler without external network access. */
function post(auth: ReturnType<typeof createAuth>, path: string, body: object) {
  return auth.handler(new Request(`${origin}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('verification email landing', () => {
  // Report: this chat, 2026-09-30. A verification email returned the user to the API root.
  // ROOT CAUSE:
  // Better Auth defaults omitted callbacks to `/`. The mail hook now selects the Auth result route before delivery.
  it.each([undefined, '/', ''])('routes registration and resend callbacks %j to the result page', async (callbackURL) => {
    const { auth, email } = createFixture()
    const address = `verify-${crypto.randomUUID()}@example.com`
    const response = await post(auth, 'sign-up/email', {
      name: 'Verification test', email: address, password: 'test-password-123', callbackURL,
    })
    expect(response.status).toBe(200)
    const initial = vi.mocked(email.sendVerification).mock.calls[0][0]
    expect(initial.to).toBe(address)
    expect(new URL(initial.url).searchParams.get('callbackURL')).toBe(successUrl)

    const resend = await post(auth, 'send-verification-email', { email: address, callbackURL })
    expect(resend.status).toBe(200)
    const link = vi.mocked(email.sendVerification).mock.calls[1][0].url
    expect(new URL(link).searchParams.get('callbackURL')).toBe(successUrl)

    const verified = await auth.handler(new Request(link))
    expect(verified.status).toBe(302)
    expect(verified.headers.get('location')).toBe(successUrl)
    const [account] = await db.select().from(user).where(eq(user.email, address))
    expect(account.emailVerified).toBe(true)

    const invalid = new URL(link)
    invalid.searchParams.set('token', 'invalid-token')
    const failed = await auth.handler(new Request(invalid))
    const failureUrl = new URL(failed.headers.get('location')!)
    expect(failed.status).toBe(302)
    expect(failureUrl.pathname).toBe('/auth/verify-email')
    expect(failureUrl.searchParams.get('error')).toBe('INVALID_TOKEN')
  })

  it('preserves explicit callbacks and their query parameters', async () => {
    const { auth, email } = createFixture()
    const callbackURL = `${origin}/custom-result?flow=signup`
    const response = await post(auth, 'sign-up/email', {
      name: 'Verification test', email: `explicit-${crypto.randomUUID()}@example.com`, password: 'test-password-123', callbackURL,
    })
    expect(response.status).toBe(200)
    const link = vi.mocked(email.sendVerification).mock.calls[0][0].url
    expect(new URL(link).searchParams.get('callbackURL')).toBe(callbackURL)
  })
})
