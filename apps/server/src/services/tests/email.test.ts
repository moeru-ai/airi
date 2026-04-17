import type { Env } from '../../libs/env'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmailService } from '../email'

const mockSend = vi.fn()
const MockResendInstances: Array<{ key: string }> = []

vi.mock('resend', () => {
  // NOTICE:
  // vi.fn() does not produce a constructor by default.
  // We use a class expression so `new Resend(key)` works correctly in tests.
  // Removal condition: if Vitest adds native constructor-compatible vi.fn() support.
  class MockResend {
    emails = { send: mockSend }
    constructor(apiKey: string) {
      MockResendInstances.push({ key: apiKey })
    }
  }
  return { Resend: MockResend }
})

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
    RESEND_FROM_EMAIL: undefined,
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

describe('createEmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockResendInstances.length = 0
  })

  describe('isAvailable', () => {
    it('returns false when RESEND_API_KEY is not set', () => {
      const service = createEmailService(makeEnv())
      expect(service.isAvailable()).toBe(false)
    })

    it('returns true when RESEND_API_KEY is set', () => {
      const service = createEmailService(makeEnv({ RESEND_API_KEY: 're_test_key' }))
      expect(service.isAvailable()).toBe(true)
    })
  })

  describe('sendEmail', () => {
    it('sends email via Resend with correct parameters', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-id' }, error: null })
      const service = createEmailService(makeEnv({
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_EMAIL: 'test@example.com',
      }))

      await service.sendEmail({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })

      expect(mockSend).toHaveBeenCalledWith({
        from: 'test@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })
    })

    it('uses default from address when RESEND_FROM_EMAIL is not set', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'email-id' }, error: null })
      const service = createEmailService(makeEnv({ RESEND_API_KEY: 're_test_key' }))

      await service.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'noreply@airi.moeru.ai' }),
      )
    })

    it('does not throw when Resend rejects — email failure must not crash auth flows', async () => {
      mockSend.mockRejectedValueOnce(new Error('Resend API error'))
      const service = createEmailService(makeEnv({ RESEND_API_KEY: 're_test_key' }))

      await expect(
        service.sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' }),
      ).resolves.toBeUndefined()
    })

    it('skips sending when RESEND_API_KEY is not set', async () => {
      const service = createEmailService(makeEnv())
      await service.sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' })
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('instantiates Resend with the provided API key', () => {
      createEmailService(makeEnv({ RESEND_API_KEY: 're_my_key' }))
      expect(MockResendInstances).toHaveLength(1)
      expect(MockResendInstances[0]!.key).toBe('re_my_key')
    })

    it('does not instantiate Resend when API key is absent', () => {
      createEmailService(makeEnv())
      expect(MockResendInstances).toHaveLength(0)
    })
  })

  describe('passwordResetEmail', () => {
    it('returns subject and html containing the reset URL', () => {
      const service = createEmailService(makeEnv())
      const url = 'https://airi.moeru.ai/reset?token=abc123'
      const result = service.passwordResetEmail(url)

      expect(result.subject).toBeTruthy()
      expect(result.html).toContain(url)
    })

    it('returns a non-empty subject string', () => {
      const service = createEmailService(makeEnv())
      const { subject } = service.passwordResetEmail('https://example.com/reset')
      expect(typeof subject).toBe('string')
      expect(subject.length).toBeGreaterThan(0)
    })
  })

  describe('emailVerificationEmail', () => {
    it('returns subject and html containing the verification URL', () => {
      const service = createEmailService(makeEnv())
      const url = 'https://airi.moeru.ai/verify?token=xyz'
      const result = service.emailVerificationEmail(url)

      expect(result.subject).toBeTruthy()
      expect(result.html).toContain(url)
    })

    it('returns a non-empty subject string', () => {
      const service = createEmailService(makeEnv())
      const { subject } = service.emailVerificationEmail('https://example.com/verify')
      expect(typeof subject).toBe('string')
      expect(subject.length).toBeGreaterThan(0)
    })
  })

  describe('changeEmailVerificationEmail', () => {
    it('returns subject and html containing the change verification URL', () => {
      const service = createEmailService(makeEnv())
      const url = 'https://airi.moeru.ai/change-email?token=qrs'
      const result = service.changeEmailVerificationEmail(url)

      expect(result.subject).toBeTruthy()
      expect(result.html).toContain(url)
    })

    it('returns a non-empty subject string', () => {
      const service = createEmailService(makeEnv())
      const { subject } = service.changeEmailVerificationEmail('https://example.com/change-email')
      expect(typeof subject).toBe('string')
      expect(subject.length).toBeGreaterThan(0)
    })
  })
})
