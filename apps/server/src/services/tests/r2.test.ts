import type { Env } from '../../libs/env'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createR2StorageService } from '../r2'

const mockSend = vi.fn().mockResolvedValue({})

vi.mock('@aws-sdk/client-s3', () => {
  return {
    // NOTICE:
    // S3Client, PutObjectCommand, DeleteObjectCommand must all be mocked with 'function'
    // (not arrow functions) because the service code calls them with `new`.
    // Arrow functions cannot be used as constructors (TypeError: not a constructor).
    // Removal condition: when the service no longer uses `new S3Client/PutObjectCommand/DeleteObjectCommand`.
    S3Client: vi.fn(() => {
      return { send: mockSend }
    }),
    PutObjectCommand: vi.fn((input: unknown) => {
      return { input, _type: 'PutObjectCommand' }
    }),
    DeleteObjectCommand: vi.fn((input: unknown) => {
      return { input, _type: 'DeleteObjectCommand' }
    }),
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
    it('returns true when all R2 env vars are set', () => {
      const service = createR2StorageService(FULL_ENV as Env)
      expect(service.isAvailable()).toBe(true)
    })

    it('returns false when R2_ACCOUNT_ID is missing', () => {
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

      expect(PutObjectCommand).toHaveBeenCalledWith({
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

    it('creates S3Client with correct endpoint and region', async () => {
      const service = createR2StorageService(FULL_ENV as Env)
      await service.upload('avatars/x/y.png', Buffer.from('d'), 'image/png')

      expect(S3Client).toHaveBeenCalledWith({
        region: 'auto',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
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

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
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
