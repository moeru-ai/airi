import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createS3ObjectStore } from './object-store'

const config = {
  S3_BUCKET: 'private-bucket',
  S3_REGION: 'us-east-1',
}

describe('s3 object store', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret')
    vi.stubEnv('AWS_SESSION_TOKEN', undefined)
    vi.stubEnv('AWS_PROFILE', undefined)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('does not create storage when unconfigured', () => {
    expect(createS3ObjectStore({})).toBeUndefined()
  })

  it('signs the content type and metadata headers for a direct upload', async () => {
    const store = createS3ObjectStore({ ...config, S3_ENDPOINT: 'https://objects.example.com', S3_FORCE_PATH_STYLE: true })!
    try {
      const target = await store.createUploadTarget({ Key: 'attachments/image one/original', ContentType: 'image/png', Metadata: { sha256: 'a'.repeat(64) } })
      const url = new URL(target.url)
      expect(url.origin).toBe('https://objects.example.com')
      expect(url.pathname).toBe('/private-bucket/attachments/image%20one/original')
      expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
      expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^test-access\//)
      expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(['content-type', 'host', 'x-amz-meta-sha256'])
      expect(url.searchParams.has('x-amz-meta-sha256')).toBe(false)
      expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false)
      expect(target.headers).toEqual({ 'content-type': 'image/png', 'x-amz-meta-sha256': 'a'.repeat(64) })
    }
    finally {
      store.dispose()
    }
  })

  it('signs virtual-hosted downloads with AWS session credentials and fixed expiry', async () => {
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-session')
    const store = createS3ObjectStore(config)!
    try {
      const url = new URL(await store.createDownloadUrl('voices/sample.wav'))
      expect(url.hostname).toBe('private-bucket.s3.us-east-1.amazonaws.com')
      expect(url.pathname).toBe('/voices/sample.wav')
      expect(url.searchParams.get('X-Amz-Security-Token')).toBe('test-session')
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    }
    finally {
      store.dispose()
    }
  })

  it('sends object bytes and metadata over HTTP and propagates storage failures', async () => {
    let storedBody: Buffer | undefined
    let storedContentType: string | undefined
    let storedMetadata: string | string[] | undefined
    const requests: { method: string | undefined, path: string, authorization: string | undefined }[] = []
    const server = createServer(async (request, response) => {
      const url = new URL(request.url!, 'http://localhost')
      requests.push({ method: request.method, path: url.pathname, authorization: request.headers.authorization })
      if (request.method === 'PUT') {
        const chunks: Buffer[] = []
        for await (const chunk of request)
          chunks.push(Buffer.from(chunk))
        storedBody = Buffer.concat(chunks)
        storedContentType = request.headers['content-type']
        storedMetadata = request.headers['x-amz-meta-source']
        response.end()
        return
      }
      if (request.method === 'DELETE') {
        storedBody = undefined
        response.writeHead(204).end()
        return
      }
      if (!storedBody) {
        response.writeHead(404, { 'content-type': 'application/xml' })
        response.end('<Error><Code>NoSuchKey</Code><Message>Missing object</Message></Error>')
        return
      }
      response.writeHead(200, { 'content-type': storedContentType!, 'content-length': storedBody.length, 'x-amz-meta-source': storedMetadata! })
      response.end(request.method === 'HEAD' ? undefined : storedBody)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP test server')
    const store = createS3ObjectStore({ ...config, S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_FORCE_PATH_STYLE: true })!
    try {
      const bytes = Buffer.from([0, 1, 128, 255])
      await store.putObject({ Key: 'audio/sample.wav', Body: bytes, ContentType: 'audio/wav', Metadata: { source: 'tts' } })
      expect(storedBody).toEqual(bytes)
      const info = await store.inspectObject('audio/sample.wav')
      expect(info.ContentLength).toBe(4)
      expect(info.ContentType).toBe('audio/wav')
      expect(info.Metadata).toEqual({ source: 'tts' })
      const download = await store.getObject('audio/sample.wav')
      expect(await download.Body!.transformToByteArray()).toEqual(new Uint8Array(bytes))
      await store.deleteObject('audio/sample.wav')
      await expect(store.getObject('audio/sample.wav')).rejects.toMatchObject({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
      await expect(store.inspectObject('audio/sample.wav')).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } })
      expect(requests.map(request => request.method)).toEqual(['PUT', 'HEAD', 'GET', 'DELETE', 'GET', 'HEAD'])
      expect(requests.every(request => request.path === '/private-bucket/audio/sample.wav')).toBe(true)
      expect(requests.every(request => request.authorization?.startsWith('AWS4-HMAC-SHA256 '))).toBe(true)
    }
    finally {
      store.dispose()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
