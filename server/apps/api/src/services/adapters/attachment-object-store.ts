import type { S3ClientConfig } from '@aws-sdk/client-s3'

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface AttachmentObjectInfo {
  contentType?: string
  sha256?: string
  size?: number
}

export interface AttachmentUploadTarget {
  headers: Record<string, string>
  url: string
}

/** Object operations required by the attachment domain. */
export interface AttachmentObjectStore {
  createDownloadUrl: (objectKey: string) => Promise<string>
  createUploadTarget: (input: { contentType: string, objectKey: string, sha256: string }) => Promise<AttachmentUploadTarget>
  deleteObject: (objectKey: string) => Promise<void>
  inspectObject: (objectKey: string) => Promise<AttachmentObjectInfo>
}

export interface S3AttachmentObjectStoreConfig {
  accessKeyId?: string
  bucket: string
  endpoint?: string
  forcePathStyle: boolean
  region: string
  secretAccessKey?: string
  signedUrlTtlSeconds: number
}

/** Creates the private S3 adapter used by attachment upload and download flows. */
export function createS3AttachmentObjectStore(config: S3AttachmentObjectStoreConfig): AttachmentObjectStore {
  const clientConfig: S3ClientConfig = {
    forcePathStyle: config.forcePathStyle,
    region: config.region,
  }
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    }
  }
  if (config.endpoint)
    clientConfig.endpoint = config.endpoint

  const client = new S3Client(clientConfig)

  return {
    async createUploadTarget(input) {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        ContentType: input.contentType,
        Key: input.objectKey,
        Metadata: { sha256: input.sha256 },
      })
      const url = await getSignedUrl(client, command, { expiresIn: config.signedUrlTtlSeconds })
      return {
        headers: {
          'content-type': input.contentType,
          'x-amz-meta-sha256': input.sha256,
        },
        url,
      }
    },

    async inspectObject(objectKey) {
      const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
      return {
        contentType: result.ContentType,
        sha256: result.Metadata?.sha256,
        size: result.ContentLength,
      }
    },

    async createDownloadUrl(objectKey) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
        { expiresIn: config.signedUrlTtlSeconds },
      )
    },

    async deleteObject(objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
    },
  }
}
