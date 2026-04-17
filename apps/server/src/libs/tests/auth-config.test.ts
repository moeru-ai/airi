import type { EmailService } from '../../services/email'
import type { R2StorageService } from '../../services/r2'
import type { Database } from '../db'
import type { Env } from '../env'

import { describe, expect, it, vi } from 'vitest'

import { createAuth } from '../auth'

const mockBetterAuth = vi.hoisted(() => vi.fn((config: unknown) => config))
const mockDrizzleAdapter = vi.hoisted(() => vi.fn(() => ({ adapter: 'drizzle' })))
const mockCreateAuthMiddleware = vi.hoisted(() => vi.fn((handler: unknown) => handler))
const mockBearer = vi.hoisted(() => vi.fn(() => ({ name: 'bearer' })))
const mockJwt = vi.hoisted(() => vi.fn(() => ({ name: 'jwt' })))
const mockOauthProvider = vi.hoisted(() => vi.fn(() => ({ name: 'oauthProvider' })))

vi.mock('better-auth', () => ({
  betterAuth: mockBetterAuth,
}))

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: mockDrizzleAdapter,
}))

vi.mock('better-auth/api', () => ({
  createAuthMiddleware: mockCreateAuthMiddleware,
}))

vi.mock('better-auth/plugins', () => ({
  bearer: mockBearer,
  jwt: mockJwt,
}))

vi.mock('@better-auth/oauth-provider', () => ({
  oauthProvider: mockOauthProvider,
}))

// NOTICE:
// The production hooks in `createAuth` receive `{ user, token }` from
// better-auth and build the redirect URL themselves from `env.CLIENT_URL`.
// Earlier revisions of these tests stubbed the call signatures with `url`
// instead of `token`, which silently produced URLs containing
// `?token=undefined` and made the assertions test the wrong contract.
// Mirror the real shape here so we exercise the URL construction logic.
// Reference: PR #1674 review comment by Rainbowbird.
interface AuthConfigForTest {
  emailAndPassword?: {
    enabled?: boolean
    requireEmailVerification?: boolean
    sendResetPassword?: (params: { user: { email: string }, token: string }) => Promise<void>
  }
  emailVerification?: {
    sendVerificationEmail?: (params: { user: { email: string }, token: string }) => Promise<void>
  }
  user?: {
    changeEmail?: {
      enabled?: boolean
      sendChangeEmailVerification?: (params: { user: { email: string }, newEmail: string, token: string }) => Promise<void>
    }
  }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    HOST: '0.0.0.0',
    PORT: 3000,
    API_SERVER_URL: 'http://localhost:3000',
    CLIENT_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'test-secret',
    AUTH_GOOGLE_CLIENT_ID: 'gid',
    AUTH_GOOGLE_CLIENT_SECRET: 'gsec',
    AUTH_GITHUB_CLIENT_ID: 'ghid',
    AUTH_GITHUB_CLIENT_SECRET: 'ghsec',
    STRIPE_SECRET_KEY: undefined,
    STRIPE_WEBHOOK_SECRET: undefined,
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET_NAME: undefined,
    R2_PUBLIC_URL: undefined,
    R2_ENDPOINT: undefined,
    RESEND_API_KEY: undefined,
    RESEND_FROM_EMAIL: 'noreply@airi.moeru.ai',
    GATEWAY_BASE_URL: 'http://localhost:18080',
    DEFAULT_CHAT_MODEL: 'openai/gpt-5-mini',
    DEFAULT_TTS_MODEL: 'microsoft/v1',
    BILLING_EVENTS_STREAM: 'billing-events',
    BILLING_EVENTS_CONSUMER_NAME: undefined,
    BILLING_EVENTS_BATCH_SIZE: 10,
    BILLING_EVENTS_BLOCK_MS: 5000,
    BILLING_EVENTS_MIN_IDLE_MS: 30000,
    DB_POOL_MAX: 20,
    DB_POOL_IDLE_TIMEOUT_MS: 30000,
    DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
    DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: 10000,
    OTEL_SERVICE_NAMESPACE: 'airi',
    OTEL_SERVICE_NAME: 'server',
    OTEL_TRACES_SAMPLING_RATIO: 1,
    OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
    OTEL_EXPORTER_OTLP_HEADERS: undefined,
    OTEL_DEBUG: undefined,
    ...overrides,
  }
}

function createEmailServiceMock() {
  const sendEmail = vi.fn<EmailService['sendEmail']>().mockResolvedValue(undefined)
  const passwordResetEmail = vi.fn<EmailService['passwordResetEmail']>().mockReturnValue({
    subject: 'Reset your AIRI password',
    html: '<p>reset</p>',
  })
  const emailVerificationEmail = vi.fn<EmailService['emailVerificationEmail']>().mockReturnValue({
    subject: 'Verify your AIRI email address',
    html: '<p>verify</p>',
  })
  const changeEmailVerificationEmail = vi.fn<EmailService['changeEmailVerificationEmail']>().mockReturnValue({
    subject: 'Confirm your new AIRI email address',
    html: '<p>change</p>',
  })
  const isAvailable = vi.fn<EmailService['isAvailable']>().mockReturnValue(true)

  const service: EmailService = {
    sendEmail,
    passwordResetEmail,
    emailVerificationEmail,
    changeEmailVerificationEmail,
    isAvailable,
  }

  return {
    service,
    sendEmail,
    passwordResetEmail,
    emailVerificationEmail,
    changeEmailVerificationEmail,
    isAvailable,
  }
}

function createAuthConfig(emailService: EmailService): AuthConfigForTest {
  const db = {} as unknown as Database
  const env = makeEnv()
  const r2StorageService: R2StorageService = {
    upload: vi.fn().mockResolvedValue('https://r2.example.com/avatars/user-1/avatar.png'),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn((key: string) => `https://r2.example.com/${key}`),
    isAvailable: vi.fn().mockReturnValue(false),
  }
  return createAuth(db, env, emailService, r2StorageService) as unknown as AuthConfigForTest
}

describe('createAuth requireEmailVerification gate', () => {
  it('requires email verification only when the email service is configured', () => {
    // @example RESEND_API_KEY is set in production → emailService.isAvailable() === true
    const emailService = createEmailServiceMock()
    emailService.isAvailable.mockReturnValue(true)
    const config = createAuthConfig(emailService.service)

    expect(config.emailAndPassword?.requireEmailVerification).toBe(true)
  })

  it('does NOT require email verification when the email service is unavailable, so users do not get locked out', () => {
    // ROOT CAUSE:
    //
    // Hard-coding `requireEmailVerification: true` regardless of email
    // configuration meant a self-hosted / local-dev deployment without
    // RESEND_API_KEY would block every newly-registered email/password
    // user — they could never receive the verification mail and therefore
    // never finish the signup flow.
    //
    // Gating on `emailService.isAvailable()` keeps the strict behaviour
    // for production while letting offline deployments still log in.
    // @example RESEND_API_KEY is empty → emailService.isAvailable() === false
    const emailService = createEmailServiceMock()
    emailService.isAvailable.mockReturnValue(false)
    const config = createAuthConfig(emailService.service)

    expect(config.emailAndPassword?.requireEmailVerification).toBe(false)
  })
})

describe('createAuth sendVerificationEmail availability guard', () => {
  it('skips sending verification email when the email service is unavailable', async () => {
    // Defence in depth: even if a future plugin invokes this hook directly,
    // we must not generate a link nobody can deliver.
    const emailService = createEmailServiceMock()
    emailService.isAvailable.mockReturnValue(false)
    const config = createAuthConfig(emailService.service)

    const sendVerificationEmail = config.emailVerification?.sendVerificationEmail
    expect(sendVerificationEmail).toBeTypeOf('function')
    if (!sendVerificationEmail)
      throw new Error('Expected emailVerification.sendVerificationEmail to be defined')

    await sendVerificationEmail({
      user: { email: 'user@example.com' },
      token: 'irrelevant',
    })

    expect(emailService.emailVerificationEmail).not.toHaveBeenCalled()
    expect(emailService.sendEmail).not.toHaveBeenCalled()
  })
})

// NOTICE:
// The hooks in `createAuth` build redirect URLs from `env.CLIENT_URL`
// (currently `http://localhost:5173` in `makeEnv`). Keep this constant
// in lockstep with `makeEnv().CLIENT_URL` so the URL assertions below
// match what the production code would actually generate.
const TEST_CLIENT_URL = 'http://localhost:5173'

describe('createAuth email hooks configuration', () => {
  it('wires sendResetPassword and sends reset email with the URL it builds from CLIENT_URL + token', async () => {
    // ROOT CAUSE:
    //
    // better-auth invokes these hooks with `{ user, token }`, not `{ user, url }`.
    // The previous tests stubbed in a hand-built `url` and asserted the
    // hook forwarded it verbatim — which was a no-op assertion that did
    // not exercise the URL construction in `auth.ts`. With a token-encoded
    // input we now also catch regressions in the path / param shape /
    // encoding strategy.
    //
    // Reference: PR #1674 review comment by Rainbowbird.
    const emailService = createEmailServiceMock()
    const config = createAuthConfig(emailService.service)

    expect(config.emailAndPassword?.enabled).toBe(true)
    const sendResetPassword = config.emailAndPassword?.sendResetPassword
    expect(sendResetPassword).toBeTypeOf('function')

    if (!sendResetPassword)
      throw new Error('Expected emailAndPassword.sendResetPassword to be defined')

    // Use a token containing characters that must be URL-encoded so the
    // test fails if `auth.ts` ever drops `encodeURIComponent`.
    const token = 'reset-token/with+special chars'
    await sendResetPassword({
      user: { email: 'user@example.com' },
      token,
    })

    const expectedUrl = `${TEST_CLIENT_URL}/auth/reset-password?token=${encodeURIComponent(token)}`
    expect(emailService.passwordResetEmail).toHaveBeenCalledWith(expectedUrl)
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Reset your AIRI password',
      html: '<p>reset</p>',
    })
  })

  it('wires email verification and sends verification email with the URL it builds from CLIENT_URL + token', async () => {
    const emailService = createEmailServiceMock()
    const config = createAuthConfig(emailService.service)

    const sendVerificationEmail = config.emailVerification?.sendVerificationEmail
    expect(sendVerificationEmail).toBeTypeOf('function')

    if (!sendVerificationEmail)
      throw new Error('Expected emailVerification.sendVerificationEmail to be defined')

    const token = 'verify-token/with+special chars'
    await sendVerificationEmail({
      user: { email: 'verify@example.com' },
      token,
    })

    const expectedUrl = `${TEST_CLIENT_URL}/auth/verify-email?token=${encodeURIComponent(token)}`
    expect(emailService.emailVerificationEmail).toHaveBeenCalledWith(expectedUrl)
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'verify@example.com',
      subject: 'Verify your AIRI email address',
      html: '<p>verify</p>',
    })
  })

  it('enables change email and sends change-email verification to the new email using the URL it builds from CLIENT_URL + token', async () => {
    const emailService = createEmailServiceMock()
    const config = createAuthConfig(emailService.service)

    expect(config.user?.changeEmail?.enabled).toBe(true)
    const sendChangeEmailVerification = config.user?.changeEmail?.sendChangeEmailVerification
    expect(sendChangeEmailVerification).toBeTypeOf('function')

    if (!sendChangeEmailVerification)
      throw new Error('Expected user.changeEmail.sendChangeEmailVerification to be defined')

    const token = 'change-token/with+special chars'
    await sendChangeEmailVerification({
      user: { email: 'old@example.com' },
      newEmail: 'new@example.com',
      token,
    })

    const expectedUrl = `${TEST_CLIENT_URL}/auth/verify-email?token=${encodeURIComponent(token)}`
    expect(emailService.changeEmailVerificationEmail).toHaveBeenCalledWith(expectedUrl)
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      subject: 'Confirm your new AIRI email address',
      html: '<p>change</p>',
    })
  })
})
