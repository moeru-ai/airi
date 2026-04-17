import type { Env } from '../libs/env'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Creates an S3-compatible storage service. Works with any S3-compatible
 * backend (AWS S3, Cloudflare R2, MinIO, Backblaze B2, Tigris, ...) by
 * pointing `S3_ENDPOINT` at the provider's URL.
 *
 * Use when:
 * - Uploading user assets (e.g. avatars) to S3-compatible object storage
 * - Deleting previously uploaded assets
 * - Deriving public CDN URLs for stored objects
 *
 * Expects:
 * - `env.S3_ENDPOINT`, `env.S3_ACCESS_KEY_ID`, `env.S3_SECRET_ACCESS_KEY`,
 *   `env.S3_BUCKET_NAME`, and `env.S3_PUBLIC_URL` to be set for full operation.
 *   For Cloudflare R2 the endpoint is
 *   `https://<account-id>.r2.cloudflarestorage.com`; operators must build it
 *   themselves and supply it via `S3_ENDPOINT`.
 * - When any required env var is absent, `isAvailable()` returns false and
 *   `upload()`/`deleteObject()` throw a configuration error.
 *
 * Returns:
 * - `{ upload, deleteObject, getPublicUrl, isAvailable }` plain object (no class).
 *
 * Call stack:
 *
 * createS3StorageService (this file)
 *   -> {@link upload} — PutObjectCommand via S3Client
 *   -> {@link deleteObject} — DeleteObjectCommand via S3Client
 *   -> {@link getPublicUrl} — pure URL concatenation
 *   -> {@link isAvailable} — env var presence check
 */
export function createS3StorageService(env: Env) {
  function isAvailable(): boolean {
    return !!(
      env.S3_ENDPOINT
      && env.S3_ACCESS_KEY_ID
      && env.S3_SECRET_ACCESS_KEY
      && env.S3_BUCKET_NAME
      && env.S3_PUBLIC_URL
    )
  }

  function createClient(): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    })
  }

  /**
   * Uploads a file to S3 and returns its public URL.
   *
   * Use when:
   * - Storing user-uploaded assets under a caller-provided key.
   *
   * Expects:
   * - `key` is the full object path (e.g. `avatars/{userId}/{timestamp}.png`).
   * - S3 env vars to be present; throws if not configured.
   *
   * Returns:
   * - The public CDN URL for the uploaded object: `${S3_PUBLIC_URL}/${key}`.
   */
  async function upload(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!isAvailable()) {
      throw new Error('S3 storage not configured')
    }

    const client = createClient()
    await client.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))

    return getPublicUrl(key)
  }

  /**
   * Deletes an object from S3 by its key.
   *
   * Use when:
   * - Removing a previously uploaded asset (e.g. old avatar on replacement).
   *
   * Expects:
   * - S3 env vars to be present; throws if not configured.
   */
  async function deleteObject(key: string): Promise<void> {
    if (!isAvailable()) {
      throw new Error('S3 storage not configured')
    }

    const client = createClient()
    await client.send(new DeleteObjectCommand({
      Bucket: env.S3_BUCKET_NAME!,
      Key: key,
    }))
  }

  /**
   * Returns the public CDN URL for a stored object without making a network call.
   *
   * Use when:
   * - Constructing image src URLs from known object keys.
   *
   * Returns:
   * - `${S3_PUBLIC_URL}/${key}`
   */
  function getPublicUrl(key: string): string {
    return `${env.S3_PUBLIC_URL}/${key}`
  }

  return {
    upload,
    deleteObject,
    getPublicUrl,
    isAvailable,
  }
}

export type S3StorageService = ReturnType<typeof createS3StorageService>
