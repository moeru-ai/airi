import type {
  ExtensionAssetTokenIssueInput,
  ExtensionAssetTokenStore,
  ExtensionAssetTokenValidateInput,
  ExtensionAssetTokenValidationResult,
} from './types'

import { randomBytes } from 'node:crypto'

import { HttpError } from '../../errors'

interface ExtensionAssetTokenRecord {
  extensionId: string
  version: string
  sessionId: string
  pathPrefix: string
  exp: number
}

function normalizePathPrefix(pathPrefix: string) {
  const normalized = pathPrefix.trim().replaceAll('\\', '/')
  if (!normalized) {
    return ''
  }

  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function createOpaqueToken() {
  return randomBytes(18).toString('base64url')
}

/**
 * Creates an in-memory opaque token store for extension static asset access.
 *
 * Use when:
 * - Main process needs short-lived auth tokens for plugin iframe asset loading
 *
 * Expects:
 * - Tokens are opaque and stored server-side only
 * - Callers revoke by plugin id or revoke all on app shutdown
 *
 * Returns:
 * - Issue/validate/revoke operations for extension asset tokens
 */
export function createExtensionAssetTokenStore(options: { now?: () => number } = {}): ExtensionAssetTokenStore {
  const now = options.now ?? (() => Date.now())
  const records = new Map<string, ExtensionAssetTokenRecord>()

  const dropIfExpired = (token: string, record: ExtensionAssetTokenRecord) => {
    if (record.exp > now()) {
      return false
    }

    records.delete(token)
    return true
  }

  const issue = (input: ExtensionAssetTokenIssueInput) => {
    const token = createOpaqueToken()
    records.set(token, {
      extensionId: input.extensionId,
      version: input.version,
      sessionId: input.sessionId,
      pathPrefix: normalizePathPrefix(input.pathPrefix),
      exp: now() + input.ttlMs,
    })
    return token
  }

  const unauthorized = (code: string, reason: string) => {
    return {
      ok: false as const,
      error: new HttpError({
        status: 401,
        code,
        message: 'Unauthorized',
        reason,
      }),
    }
  }

  const validate = (token: string, input: ExtensionAssetTokenValidateInput): ExtensionAssetTokenValidationResult => {
    const record = records.get(token)
    if (!record) {
      return unauthorized('EXTENSION_ASSET_TOKEN_NOT_FOUND', 'token was not found in token store')
    }

    if (dropIfExpired(token, record)) {
      return unauthorized('EXTENSION_ASSET_TOKEN_EXPIRED', 'token has expired')
    }

    if (record.extensionId !== input.extensionId) {
      return unauthorized('EXTENSION_ASSET_EXTENSION_MISMATCH', 'token extensionId does not match request extensionId')
    }

    if (typeof input.version === 'string' && record.version !== input.version) {
      return unauthorized('EXTENSION_ASSET_VERSION_MISMATCH', 'token version does not match request version')
    }

    const normalizedAssetPath = input.assetPath.trim().replaceAll('\\', '/')
    if (!normalizedAssetPath) {
      return unauthorized('EXTENSION_ASSET_PATH_EMPTY', 'asset path is empty')
    }

    if (record.pathPrefix && !normalizedAssetPath.startsWith(record.pathPrefix)) {
      return unauthorized('EXTENSION_ASSET_PATH_PREFIX_MISMATCH', 'asset path is outside allowed prefix')
    }

    return { ok: true }
  }

  return {
    issue,
    validate,
    revokeByExtensionId(extensionId) {
      for (const [token, record] of records.entries()) {
        if (record.extensionId === extensionId) {
          records.delete(token)
        }
      }
    },
    revokeAll() {
      records.clear()
    },
  }
}
