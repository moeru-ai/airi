import type { Buffer } from 'node:buffer'

import type { UploadProvider } from './types'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { S3mini } from 's3mini'

const LEADING_SLASHES_PATTERN = /^\/*/
const TRAILING_SLASHES_PATTERN = /\/*$/
const TRAILING_URL_SLASHES_PATTERN = /\/+$/
const LEADING_URL_SLASHES_PATTERN = /^\/+/
const ETAG_QUOTES_PATTERN = /^"+|"+$/g

export interface S3ProviderOptions {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  region?: string
  requestSizeInBytes?: number
  requestAbortTimeout?: number
  /**
   * Skip uploading when the remote object ETag matches the local content hash (MD5). Enabled by default.
   */
  skipNotModified?: boolean
  /**
   * Public base URL used in rewritten assets. Defaults to endpoint.
   */
  publicBaseUrl?: string
}

export function createS3Provider(options: S3ProviderOptions): UploadProvider {
  const client = new S3mini({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpoint,
    region: options.region ?? 'auto',
    requestAbortTimeout: options.requestAbortTimeout,
    requestSizeInBytes: options.requestSizeInBytes,
  })

  const publicBaseUrl = options.publicBaseUrl ?? options.endpoint
  const skipNotModified = options.skipNotModified !== false

  return {
    async upload(localPath: string, key: string, contentType?: string) {
      const data = await readFile(localPath)
      await client.putObject(normalizeKey(key), data, contentType ?? 'application/octet-stream')
    },
    async cleanPrefix(prefix: string) {
      const normalizedPrefix = normalizePrefix(prefix)
      if (!normalizedPrefix)
        return

      const objects = await client.listObjects('/', `${normalizedPrefix}/`)
      if (!objects?.length)
        return

      const keys = objects.map(obj => obj.Key)
      await client.deleteObjects(keys)
    },
    async shouldSkipUpload(localPath: string, key: string) {
      if (!skipNotModified)
        return false

      const data = await readFile(localPath)
      return isMd5HashMatched(client, key, data)
    },
    getPublicUrl(key: string) {
      return joinUrl(publicBaseUrl, key)
    },
  }
}

async function isMd5HashMatched(client: S3mini, key: string, data: Buffer) {
  try {
    const etag = await client.getEtag(normalizeKey(key))
    if (!etag)
      return false

    const normalizedEtag = sanitizeEtag(etag)
    if (!normalizedEtag || normalizedEtag.includes('-'))
      return false

    const localHash = createHash('md5').update(data).digest('hex')
    return normalizedEtag.toLowerCase() === localHash.toLowerCase()
  }
  catch {
    return false
  }
}

function normalizePrefix(prefix: string) {
  return prefix.replace(LEADING_SLASHES_PATTERN, '').replace(TRAILING_SLASHES_PATTERN, '')
}

function normalizeKey(key: string) {
  return key.replace(LEADING_SLASHES_PATTERN, '')
}

function joinUrl(base: string, path: string) {
  return `${base.replace(TRAILING_URL_SLASHES_PATTERN, '')}/${path.replace(LEADING_URL_SLASHES_PATTERN, '')}`
}

function sanitizeEtag(etag: string) {
  return etag.replace(ETAG_QUOTES_PATTERN, '')
}
