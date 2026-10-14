import type { PutObjectCommandInput } from '@aws-sdk/client-s3'

import type { S3Environment } from './s3-config'

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Creates one bucket-scoped client from validated startup configuration.
 * Callers own authorization and object keys.
 * The application must stop callers before disposal. SDK errors propagate without translation.
 */
export function createS3ObjectStore(config: S3Environment) {
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE ?? false,
    // Direct uploads are signed before their body exists. An automatic checksum
    // would bind the URL to an empty body instead of the uploader's bytes.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })
  const bucket = config.S3_BUCKET
  const expiresIn = 900

  return {
    /** Uploads bytes to the exact key. Domain callers own size limits and overwrite policy. */
    async putObject(input: Pick<PutObjectCommandInput, 'Key' | 'Body' | 'ContentType' | 'Metadata'>) {
      return client.send(new PutObjectCommand({ ...input, Bucket: bucket }))
    },

    /** Returns a live SDK response stream. The caller must consume or destroy its Body. `range` is an HTTP Range value such as `bytes=0-3`. */
    async getObject(objectKey: string, range?: string) {
      return client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey, Range: range }))
    },

    /** Reads current object metadata, including the stored SHA-256 checksum. A missing object rejects with the SDK error. */
    async inspectObject(objectKey: string) {
      return client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey, ChecksumMode: 'ENABLED' }))
    },

    async deleteObject(objectKey: string) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
    },

    /**
     * Signs a PUT and returns the headers the uploader must send unchanged.
     * `ChecksumSHA256` (base64) makes the store reject bytes that do not match.
     * `IfNoneMatch: '*'` makes the store reject a write to an existing key.
     */
    async createUploadTarget(input: Pick<PutObjectCommandInput, 'Key' | 'ContentType' | 'Metadata' | 'ChecksumSHA256' | 'IfNoneMatch'>) {
      const headers: Record<string, string> = {}
      if (input.ContentType)
        headers['content-type'] = input.ContentType
      if (input.ChecksumSHA256)
        headers['x-amz-checksum-sha256'] = input.ChecksumSHA256
      if (input.IfNoneMatch)
        headers['if-none-match'] = input.IfNoneMatch
      if (input.Metadata) {
        for (const [key, value] of Object.entries(input.Metadata))
          headers[`x-amz-meta-${key.toLowerCase()}`] = value
      }
      const command = new PutObjectCommand({ ...input, Bucket: bucket })
      const url = await getSignedUrl(client, command, {
        expiresIn,
        signableHeaders: new Set(Object.keys(headers)),
        unhoistableHeaders: new Set(Object.keys(headers)),
      })
      return { url, headers }
    },

    /** Returns a temporary bearer URL. Callers must authorize access before this call. */
    async createDownloadUrl(objectKey: string) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn })
    },

    /** Releases SDK connections after dependent callers stop. */
    dispose() {
      client.destroy()
    },
  }
}

/** Bucket transport shared by API domains. It does not own access control or database records. */
export type ObjectStore = ReturnType<typeof createS3ObjectStore>
