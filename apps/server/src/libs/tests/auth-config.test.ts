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
const mockGenerateIdenticon = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from([137, 80, 78, 71])))

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

vi.mock('../../utils/identicon', () => ({
  generateIdenticon: mockGenerateIdenticon,
}))

interface AuthConfigForTest {
  emailAndPassword?: {
    enabled?: boolean
    sendResetPassword?: (params: { user: { email: string }, url: string }) => Promise<void>
  }
  emailVerification?: {
    sendVerificationEmail?: (params: { user: { email: string }, url: string }) => Promise<void>
  }
  user?: {
    changeEmail?: {
      enabled?: boolean
      sendChangeEmailVerification?: (params: { user: { email: string }, newEmail: string, url: string }) => Promise<void>
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
    RESEND_API_KEY: undefined,
    RESEND_FROM_EMAIL: undefined,
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

describe('createAuth email hooks configuration', () => {
  it('wires sendResetPassword and sends reset email', async () => {
    const emailService = createEmailServiceMock()
    const config = createAuthConfig(emailService.service)

    expect(config.emailAndPassword?.enabled).toBe(true)
    const sendResetPassword = config.emailAndPassword?.sendResetPassword
    expect(sendResetPassword).toBeTypeOf('function')

    if (!sendResetPassword)
      throw new Error('Expected emailAndPassword.sendResetPassword to be defined')

    const url = 'https://airi.moeru.ai/reset?token=token-1'
    await sendResetPassword({
      user: { email: 'user@example.com' },
      url,
    })

    expect(emailService.passwordResetEmail).toHaveBeenCalledWith(url)
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Reset your AIRI password',
      html: '<p>reset</p>',
    })
  })

  it('wires email verification and sends verification email', async () => {
    const emailService = createEmailServiceMock()
    const config = createAuthConfig(emailService.service)

    const sendVerificationEmail = config.emailVerification?.sendVerificationEmail
    expect(sendVerificationEmail).toBeTypeOf('function')

    if (!sendVerificationEmail)
      throw new Error('Expected emailVerification.sendVerificationEmail to be defined')

    const url = 'https://airi.moeru.ai/verify-email?token=token-2'
    await sendVerificationEmail({
      user: { email: 'verify@example.com' },
      url,
    })

    expect(emailService.emailVerificationEmail).toHaveBeenCalledWith(url)
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'verify@example.com',
      subject: 'Verify your AIRI email address',
      html: '<p>verify</p>',
    })
  })

  it('enables change email and sends change-email verification to the new email', async () => {
    const emailService = createEmailServiceMock()
    const config = createAuthConfig(emailService.service)

    expect(config.user?.changeEmail?.enabled).toBe(true)
    const sendChangeEmailVerification = config.user?.changeEmail?.sendChangeEmailVerification
    expect(sendChangeEmailVerification).toBeTypeOf('function')

    if (!sendChangeEmailVerification)
      throw new Error('Expected user.changeEmail.sendChangeEmailVerification to be defined')

    const url = 'https://airi.moeru.ai/change-email?token=token-3'
    await sendChangeEmailVerification({
      user: { email: 'old@example.com' },
      newEmail: 'new@example.com',
      url,
    })

    expect(emailService.changeEmailVerificationEmail).toHaveBeenCalledWith(url)
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      subject: 'Confirm your new AIRI email address',
      html: '<p>change</p>',
    })
  })
})
