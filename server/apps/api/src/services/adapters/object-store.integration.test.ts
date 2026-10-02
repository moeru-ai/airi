import process from 'node:process'

import { randomUUID } from 'node:crypto'

import { CreateBucketCommand, DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { createS3ObjectStore } from './object-store'
import { S3EnvironmentSchema } from './s3-config'

describe.skipIf(!process.env.TEST_S3_ENDPOINT)('s3-compatible server integration', () => {
  it('uploads, signs, downloads, inspects, and deletes objects in an isolated bucket', async () => {
    const config = parse(S3EnvironmentSchema, {
      S3_BUCKET: `airi-s3-test-${randomUUID()}`,
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: process.env.TEST_S3_ENDPOINT,
      S3_FORCE_PATH_STYLE: 'true',
    })
    const admin = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: true,
    })
    const store = createS3ObjectStore(config)!
    const objectKey = 'audio/test sample.wav'
    let bucketCreated = false
    try {
      await admin.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }))
      bucketCreated = true
      await store.putObject({ Key: objectKey, Body: 'server upload', ContentType: 'audio/wav', Metadata: { source: 'server' } })
      const original = await store.getObject(objectKey)
      expect(await original.Body!.transformToString()).toBe('server upload')

      const target = await store.createUploadTarget({ Key: objectKey, ContentType: 'audio/wav', Metadata: { source: 'browser' } })
      const tampered = await fetch(target.url, { method: 'PUT', headers: { ...target.headers, 'content-type': 'text/plain' }, body: 'tampered upload' })
      expect(tampered.status).toBe(403)
      await tampered.text()
      const upload = await fetch(target.url, { method: 'PUT', headers: target.headers, body: 'direct upload' })
      expect(upload.status).toBe(200)
      await upload.text()
      const info = await store.inspectObject(objectKey)
      expect(info.ContentLength).toBe(13)
      expect(info.ContentType).toBe('audio/wav')
      expect(info.Metadata).toEqual({ source: 'browser' })
      const download = await fetch(await store.createDownloadUrl(objectKey))
      expect(download.status).toBe(200)
      expect(await download.text()).toBe('direct upload')
      await store.deleteObject(objectKey)
      await expect(store.inspectObject(objectKey)).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } })
    }
    finally {
      try {
        if (bucketCreated) {
          await store.deleteObject(objectKey)
          await admin.send(new DeleteBucketCommand({ Bucket: config.S3_BUCKET }))
        }
      }
      finally {
        store.dispose()
        admin.destroy()
      }
    }
  })
})
