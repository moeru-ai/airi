import type { EmailService } from '../../services/email'
import type { R2StorageService } from '../../services/r2'
import type { Database } from '../db'
import type { Env } from '../env'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createAuth } from '../auth'

const mockBetterAuth = vi.hoisted(() => vi.fn((config: unknown) => config))
const mockDrizzleAdapter = vi.hoisted(() => vi.fn(() => ({ adapter: 'drizzle' })))
const mockCreateAuthMiddleware = vi.hoisted(() => vi.fn((handler: unknown) => handler))
const mockBearer = vi.hoisted(() => vi.fn(() => ({ name: 'bearer' })))
const mockJwt = vi.hoisted(() => vi.fn(() => ({ name: 'jwt' })))
const mockOauthProvider = vi.hoisted(() => vi.fn(() => ({ name: 'oauthProvider' })))
const mockLoggerError = vi.hoisted(() => vi.fn())
const mockLoggerWithError = vi.hoisted(() => vi.fn(() => ({ error: mockLoggerError })))
const mockUseLogger = vi.hoisted(() => vi.fn(() => ({ withError: mockLoggerWithError, error: mockLoggerError })))
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

vi.mock('@guiiai/logg', () => ({
  useLogger: mockUseLogger,
}))

vi.mock('../../utils/identicon', () => ({
  generateIdenticon: mockGenerateIdenticon,
}))

vi.mock('../../services/r2', () => ({}))

interface AuthConfigForHooksTest {
  databaseHooks?: {
    user?: {
      create?: {
        after?: (user: { id: string, image?: string | null }) => Promise<void>
      }
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

function createEmailServiceMock(): EmailService {
  return {
    sendEmail: vi.fn<EmailService['sendEmail']>().mockResolvedValue(undefined),
    passwordResetEmail: vi.fn<EmailService['passwordResetEmail']>().mockReturnValue({ subject: 'Reset', html: '<p>reset</p>' }),
    emailVerificationEmail: vi.fn<EmailService['emailVerificationEmail']>().mockReturnValue({ subject: 'Verify', html: '<p>verify</p>' }),
    changeEmailVerificationEmail: vi.fn<EmailService['changeEmailVerificationEmail']>().mockReturnValue({ subject: 'Change', html: '<p>change</p>' }),
    isAvailable: vi.fn<EmailService['isAvailable']>().mockReturnValue(true),
  }
}

function createR2StorageServiceMock(isAvailable: boolean): {
  service: R2StorageService
  upload: ReturnType<typeof vi.fn<R2StorageService['upload']>>
  isAvailable: ReturnType<typeof vi.fn<R2StorageService['isAvailable']>>
} {
  const upload = vi.fn<R2StorageService['upload']>().mockResolvedValue('https://r2.example.com/avatars/user-1/123.jpg')
  const isAvailableMock = vi.fn<R2StorageService['isAvailable']>().mockReturnValue(isAvailable)

  const service: R2StorageService = {
    upload,
    deleteObject: vi.fn<R2StorageService['deleteObject']>().mockResolvedValue(undefined),
    getPublicUrl: vi.fn((key: string) => `https://r2.example.com/${key}`),
    isAvailable: isAvailableMock,
  }

  return {
    service,
    upload,
    isAvailable: isAvailableMock,
  }
}

function createDatabaseMock(): {
  db: Database
  update: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
} {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const db = { update } as unknown as Database
  return { db, update, set, where }
}

function getUserCreateAfterHook(config: AuthConfigForHooksTest): (user: { id: string, image?: string | null }) => Promise<void> {
  const after = config.databaseHooks?.user?.create?.after
  if (!after) {
    throw new Error('Expected databaseHooks.user.create.after to be defined')
  }
  return after
}

async function flushFireAndForgetTasks(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('createAuth user create hook avatar processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies OAuth avatar to R2 and updates user image in DB', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      headers: { get: () => 'image/jpeg' },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { db, update, set, where } = createDatabaseMock()
    const { service: r2StorageService, upload, isAvailable } = createR2StorageServiceMock(true)
    const config = createAuth(db, makeEnv(), createEmailServiceMock(), r2StorageService) as unknown as AuthConfigForHooksTest
    const afterHook = getUserCreateAfterHook(config)

    await afterHook({ id: 'user-1', image: 'https://example.com/oauth-avatar.jpg' })
    await flushFireAndForgetTasks()

    expect(isAvailable).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/oauth-avatar.jpg')
    expect(upload).toHaveBeenCalledOnce()

    const [uploadedKey, uploadedBuffer, uploadedContentType] = upload.mock.calls[0]
    expect(uploadedKey).toMatch(/^avatars\/user-1\/\d+\.jpg$/)
    expect(uploadedBuffer).toBeInstanceOf(Buffer)
    expect(uploadedContentType).toBe('image/jpeg')

    expect(update).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith({ image: 'https://r2.example.com/avatars/user-1/123.jpg' })
    expect(where).toHaveBeenCalledOnce()
    expect(mockGenerateIdenticon).not.toHaveBeenCalled()
  })

  it('generates identicon fallback when OAuth avatar is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { db, set } = createDatabaseMock()
    const { service: r2StorageService, upload } = createR2StorageServiceMock(true)
    const config = createAuth(db, makeEnv(), createEmailServiceMock(), r2StorageService) as unknown as AuthConfigForHooksTest
    const afterHook = getUserCreateAfterHook(config)

    await afterHook({ id: 'user-2', image: null })
    await flushFireAndForgetTasks()

    expect(mockGenerateIdenticon).toHaveBeenCalledWith('user-2')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledOnce()

    const [uploadedKey, uploadedBuffer, uploadedContentType] = upload.mock.calls[0]
    expect(uploadedKey).toMatch(/^avatars\/user-2\/\d+\.png$/)
    expect(uploadedBuffer).toBeInstanceOf(Buffer)
    expect(uploadedContentType).toBe('image/png')
    expect(set).toHaveBeenCalledWith({ image: 'https://r2.example.com/avatars/user-1/123.jpg' })
  })

  it('exits early when R2 is unavailable', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { db, update } = createDatabaseMock()
    const { service: r2StorageService, upload, isAvailable } = createR2StorageServiceMock(false)
    const config = createAuth(db, makeEnv(), createEmailServiceMock(), r2StorageService) as unknown as AuthConfigForHooksTest
    const afterHook = getUserCreateAfterHook(config)

    await afterHook({ id: 'user-3', image: 'https://example.com/avatar.png' })
    await flushFireAndForgetTasks()

    expect(isAvailable).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('logs errors when OAuth avatar fetch fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: { get: () => 'image/jpeg' },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { db, update } = createDatabaseMock()
    const { service: r2StorageService, upload } = createR2StorageServiceMock(true)
    const config = createAuth(db, makeEnv(), createEmailServiceMock(), r2StorageService) as unknown as AuthConfigForHooksTest
    const afterHook = getUserCreateAfterHook(config)

    await expect(afterHook({ id: 'user-4', image: 'https://example.com/broken.jpg' })).resolves.toBeUndefined()
    await flushFireAndForgetTasks()

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/broken.jpg')
    expect(upload).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(mockLoggerWithError).toHaveBeenCalledOnce()
    expect(mockLoggerError).toHaveBeenCalledWith('Failed to process user avatar on registration')
  })
})
