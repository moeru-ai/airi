import { describe, expect, it } from 'vitest'

import { createS3AttachmentObjectStore } from './attachment-object-store'

describe('s3 attachment object store', () => {
  it('creates a SigV4 PUT URL and the headers required by finalization', async () => {
    const store = createS3AttachmentObjectStore({
      accessKeyId: 'access-key',
      bucket: 'private-bucket',
      endpoint: 'https://objects.test',
      forcePathStyle: true,
      region: 'auto',
      secretAccessKey: 'secret-key',
      signedUrlTtlSeconds: 900,
    })

    const target = await store.createUploadTarget({
      contentType: 'image/png',
      objectKey: 'attachments/attachment-1/original',
      sha256: 'a'.repeat(64),
    })
    const url = new URL(target.url)

    expect(url.origin).toBe('https://objects.test')
    expect(url.pathname).toBe('/private-bucket/attachments/attachment-1/original')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(target.headers).toEqual({
      'content-type': 'image/png',
      'x-amz-meta-sha256': 'a'.repeat(64),
    })
  })
})
