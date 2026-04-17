import type { Env } from '../../libs/env'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createR2StorageService } from '../r2'

const mockSend = vi.fn().mockResolvedValue({})

// NOTICE:
// `S3Client`, `PutObjectCommand`, and `DeleteObjectCommand` are all invoked
// with `new` in the service code, so the mocks must be real constructible
// functions. `vi.fn(() => ...)` was previously used here and silently broke:
// arrow functions cannot be used as constructors and `vi.fn(...)` does not
// preserve `[[Construct]]` even for non-arrow factories — Vitest spies still
// fail when called with `new`. Plain `function () {}` mocks attach the
// constructor calls to a wrapping `vi.fn` so we keep call assertions while
// remaining `new`-able.
// Source: https://vitest.dev/api/mock.html#mockconstructor and
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions#cannot_be_used_as_constructors
// Removal condition: when the service no longer uses `new` on these classes,
// or Vitest gains first-class constructor mocks we can use here.
const S3ClientMock = vi.fn()
const PutObjectCommandMock = vi.fn((input: unknown) => ({ input, _type: 'PutObjectCommand' }))
const DeleteObjectCommandMock = vi.fn((input: unknown) => ({ input, _type: 'DeleteObjectCommand' }))

vi.mock('@aws-sdk/client-s3', () => {
  function S3Client(this: { send: typeof mockSend }, ...args: unknown[]) {
    S3ClientMock(...args)
    this.send = mockSend
  }
  function PutObjectCommand(this: Record<string, unknown>, input: unknown) {
    Object.assign(this, PutObjectCommandMock(input))
  }
  function DeleteObjectCommand(this: Record<string, unknown>, input: unknown) {
    Object.assign(this, DeleteObjectCommandMock(input))
  }

  return {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
  }
})

const FULL_ENV: Partial<Env> = {
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://cdn.example.com',
}

describe('r2StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  describe('isAvailable', () => {
    it('returns true when all R2 env vars are set (Cloudflare path via R2_ACCOUNT_ID)', () => {
      const service = createR2StorageService(FULL_ENV as Env)
      expect(service.isAvailable()).toBe(true)
    })

    it('returns true when R2_ENDPOINT is set without R2_ACCOUNT_ID (custom S3 provider)', () => {
      const service = createR2StorageService({
        ...FULL_ENV,
        R2_ACCOUNT_ID: undefined,
        R2_ENDPOINT: 'https://s3.example.com',
      } as Env)
      expect(service.isAvailable()).toBe(true)
    })

    it('returns false when both R2_ACCOUNT_ID and R2_ENDPOINT are missing', () => {
      const service = createR2StorageService({ ...FULL_ENV, R2_ACCOUNT_ID: undefined } as Env)
      expect(service.isAvailable()).toBe(false)
    })

    it('returns false when R2_ACCESS_KEY_ID is missing', () => {
      const service = createR2StorageService({ ...FULL_ENV, R2_ACCESS_KEY_ID: undefined } as Env)
      expect(service.isAvailable()).toBe(false)
    })

    it('returns false when R2_SECRET_ACCESS_KEY is missing', () => {
      const service = createR2StorageService({ ...FULL_ENV, R2_SECRET_ACCESS_KEY: undefined } as Env)
      expect(service.isAvailable()).toBe(false)
    })

    it('returns false when R2_BUCKET_NAME is missing', () => {
      const service = createR2StorageService({ ...FULL_ENV, R2_BUCKET_NAME: undefined } as Env)
      expect(service.isAvailable()).toBe(false)
    })

    it('returns false when R2_PUBLIC_URL is missing', () => {
      const service = createR2StorageService({ ...FULL_ENV, R2_PUBLIC_URL: undefined } as Env)
      expect(service.isAvailable()).toBe(false)
    })

    it('returns false when no R2 env vars are set', () => {
      const service = createR2StorageService({} as Env)
      expect(service.isAvailable()).toBe(false)
    })
  })

  describe('getPublicUrl', () => {
    it('returns concatenation of R2_PUBLIC_URL and key', () => {
      const service = createR2StorageService(FULL_ENV as Env)
      expect(service.getPublicUrl('avatars/user-1/123.png')).toBe('https://cdn.example.com/avatars/user-1/123.png')
    })

    it('handles nested key paths correctly', () => {
      const service = createR2StorageService(FULL_ENV as Env)
      expect(service.getPublicUrl('avatars/abc-def/1700000000.jpg')).toBe('https://cdn.example.com/avatars/abc-def/1700000000.jpg')
    })
  })

  describe('upload', () => {
    it('calls PutObjectCommand with correct bucket, key, body, and contentType', async () => {
      const service = createR2StorageService(FULL_ENV as Env)
      const body = Buffer.from('fake-image-data')
      await service.upload('avatars/user-1/123.png', body, 'image/png')

      expect(PutObjectCommandMock).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'avatars/user-1/123.png',
        Body: body,
        ContentType: 'image/png',
      })
      expect(mockSend).toHaveBeenCalledOnce()
    })

    it('returns the correct public URL after upload', async () => {
      const service = createR2StorageService(FULL_ENV as Env)
      const body = Buffer.from('data')
      const url = await service.upload('avatars/user-2/456.webp', body, 'image/webp')
      expect(url).toBe('https://cdn.example.com/avatars/user-2/456.webp')
    })

    it('creates S3Client with the Cloudflare R2 endpoint derived from R2_ACCOUNT_ID', async () => {
      const service = createR2StorageService(FULL_ENV as Env)
      await service.upload('avatars/x/y.png', Buffer.from('d'), 'image/png')

      expect(S3ClientMock).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret',
        },
      })
    })

    it('prefers R2_ENDPOINT verbatim when set, allowing any S3-compatible provider', async () => {
      const service = createR2StorageService({
        ...FULL_ENV,
        R2_ACCOUNT_ID: undefined,
        R2_ENDPOINT: 'https://s3.us-west-001.backblazeb2.com',
      } as Env)
      await service.upload('avatars/x/y.png', Buffer.from('d'), 'image/png')

      expect(S3ClientMock).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://s3.us-west-001.backblazeb2.com',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret',
        },
      })
    })

    it('uses R2_ENDPOINT over R2_ACCOUNT_ID when both are set', async () => {
      const service = createR2StorageService({
        ...FULL_ENV,
        R2_ENDPOINT: 'https://custom.s3.local',
      } as Env)
      await service.upload('avatars/x/y.png', Buffer.from('d'), 'image/png')

      expect(S3ClientMock).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://custom.s3.local',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret',
        },
      })
    })

    it('throws when R2 is not configured', async () => {
      const service = createR2StorageService({} as Env)
      await expect(service.upload('key', Buffer.from('data'), 'image/png'))
        .rejects
        .toThrow('R2 storage not configured')
    })
  })

  describe('deleteObject', () => {
    it('calls DeleteObjectCommand with correct bucket and key', async () => {
      const service = createR2StorageService(FULL_ENV as Env)
      await service.deleteObject('avatars/user-1/123.png')

      expect(DeleteObjectCommandMock).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'avatars/user-1/123.png',
      })
      expect(mockSend).toHaveBeenCalledOnce()
    })

    it('resolves without returning a value', async () => {
      const service = createR2StorageService(FULL_ENV as Env)
      const result = await service.deleteObject('avatars/user-1/123.png')
      expect(result).toBeUndefined()
    })

    it('throws when R2 is not configured', async () => {
      const service = createR2StorageService({} as Env)
      await expect(service.deleteObject('avatars/user-1/123.png'))
        .rejects
        .toThrow('R2 storage not configured')
    })
  })
})
