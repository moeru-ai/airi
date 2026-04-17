import type { Env } from '../libs/env'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Resolves the S3-compatible endpoint URL.
 *
 * Use when:
 * - Building the `S3Client` for upload/delete calls.
 * - Validating availability — we still need either an explicit `R2_ENDPOINT`
 *   or an `R2_ACCOUNT_ID` we can plug into the Cloudflare-hosted URL.
 *
 * Returns:
 * - `R2_ENDPOINT` verbatim when set (full S3 endpoint URL).
 * - `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` when only the account
 *   id is provided (Cloudflare R2 convenience).
 * - `undefined` when neither is configured — caller treats that as "no
 *   storage configured".
 */
function resolveEndpoint(env: Env): string | undefined {
  if (env.R2_ENDPOINT)
    return env.R2_ENDPOINT
  if (env.R2_ACCOUNT_ID)
    return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return undefined
}

/**
 * Creates an S3-compatible storage service. Defaults to Cloudflare R2 but
 * works with any S3-compatible backend (MinIO, B2, AWS S3, Tigris, ...) via
 * `R2_ENDPOINT`.
 *
 * Use when:
 * - Uploading user assets (e.g. avatars) to S3-compatible object storage
 * - Deleting previously uploaded assets
 * - Deriving public CDN URLs for stored objects
 *
 * Expects:
 * - `env.R2_ACCESS_KEY_ID`, `env.R2_SECRET_ACCESS_KEY`, `env.R2_BUCKET_NAME`,
 *   `env.R2_PUBLIC_URL`, and an endpoint source (either `env.R2_ENDPOINT` or
 *   `env.R2_ACCOUNT_ID`) to be set for full operation.
 * - When any required env var is absent, `isAvailable()` returns false and
 *   `upload()`/`deleteObject()` throw a configuration error.
 *
 * Returns:
 * - `{ upload, deleteObject, getPublicUrl, isAvailable }` plain object (no class).
 *
 * Call stack:
 *
 * createR2StorageService (this file)
 *   -> {@link resolveEndpoint}
 *   -> {@link upload} — PutObjectCommand via S3Client
 *   -> {@link deleteObject} — DeleteObjectCommand via S3Client
 *   -> {@link getPublicUrl} — pure URL concatenation
 *   -> {@link isAvailable} — env var presence check
 */
export function createR2StorageService(env: Env) {
  function isAvailable(): boolean {
    return !!(
      resolveEndpoint(env)
      && env.R2_ACCESS_KEY_ID
      && env.R2_SECRET_ACCESS_KEY
      && env.R2_BUCKET_NAME
      && env.R2_PUBLIC_URL
    )
  }

  function createClient(): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: resolveEndpoint(env),
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }

  /**
   * Uploads a file to R2 and returns its public URL.
   *
   * Use when:
   * - Storing user-uploaded assets under a caller-provided key.
   *
   * Expects:
   * - `key` is the full object path (e.g. `avatars/{userId}/{timestamp}.png`).
   * - R2 env vars to be present; throws if not configured.
   *
   * Returns:
   * - The public CDN URL for the uploaded object: `${R2_PUBLIC_URL}/${key}`.
   */
  async function upload(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!isAvailable()) {
      throw new Error('R2 storage not configured')
    }

    const client = createClient()
    await client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))

    return getPublicUrl(key)
  }

  /**
   * Deletes an object from R2 by its key.
   *
   * Use when:
   * - Removing a previously uploaded asset (e.g. old avatar on replacement).
   *
   * Expects:
   * - R2 env vars to be present; throws if not configured.
   */
  async function deleteObject(key: string): Promise<void> {
    if (!isAvailable()) {
      throw new Error('R2 storage not configured')
    }

    const client = createClient()
    await client.send(new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
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
   * - `${R2_PUBLIC_URL}/${key}`
   */
  function getPublicUrl(key: string): string {
    return `${env.R2_PUBLIC_URL}/${key}`
  }

  return {
    upload,
    deleteObject,
    getPublicUrl,
    isAvailable,
  }
}

export type R2StorageService = ReturnType<typeof createR2StorageService>
