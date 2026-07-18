import type {
  StaticAssetSession,
  StaticAssetSessionCreateInput,
  StaticAssetSessionStore,
  StaticAssetSessionValidateInput,
  StaticAssetSessionValidationResult,
} from './types'

import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'

import { HttpError } from '../errors'
import { normalizeStaticAssetPath } from './paths'

interface StaticAssetSessionRecord {
  assetSessionId: string
  extensionId: string
  version: string
  ownerSessionId: string
  pathPrefix: string
  ttlMs: number
  cookieName: string
  cookieValue: string
  cookiePath: string
  expiresAt: number
}

/**
 * Normalizes asset path prefixes used to constrain a session.
 *
 * Before:
 * - " assets\\ "
 *
 * After:
 * - "assets/"
 */
function normalizePathPrefix(pathPrefix: string) {
  const normalizedInput = pathPrefix.trim().replaceAll('\\', '/')
  if (!normalizedInput) {
    return ''
  }

  const isDirectoryPrefix = normalizedInput.endsWith('/')
  const normalized = normalizeStaticAssetPath(normalizedInput)
  if (!normalized) {
    throw new RangeError('Extension asset session pathPrefix must be empty or a safe plugin asset path')
  }

  return isDirectoryPrefix ? `${normalized}/` : normalized
}

/**
 * Normalizes requested asset paths before comparing them to session prefixes.
 *
 * Before:
 * - " assets\\index.js "
 *
 * After:
 * - "assets/index.js"
 */
function normalizeAssetPath(assetPath: string) {
  return normalizeStaticAssetPath(assetPath.trim().replaceAll('\\', '/'))
}

function createOpaqueToken() {
  // Node's base64url alphabet is route/cookie friendly while staying opaque.
  return randomBytes(18).toString('base64url')
}

/**
 * Creates the cookie name for a cookie-backed extension asset session.
 *
 * Use when:
 * - Issuing extension asset session cookies
 * - Reading extension asset session cookies from static asset route requests
 *
 * Expects:
 * - `assetSessionId` is the opaque id returned by the session store
 *
 * Returns:
 * - Stable cookie name shared by session creation and route validation
 */
export function createStaticAssetSessionCookieName(assetSessionId: string) {
  return `airi_extension_asset_session_${assetSessionId}`
}

function createCookiePath(extensionId: string, assetSessionId: string) {
  return `/_airi/extensions/${encodeURIComponent(extensionId)}/sessions/${encodeURIComponent(assetSessionId)}/ui`
}

function createSessionSnapshot(record: StaticAssetSessionRecord): StaticAssetSession {
  return Object.freeze({
    assetSessionId: record.assetSessionId,
    cookieName: record.cookieName,
    cookieValue: record.cookieValue,
    cookiePath: record.cookiePath,
    expiresAt: record.expiresAt,
  })
}

function cookieValuesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const actualBuffer = Buffer.from(actual, 'utf8')
  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

function unauthorized(code: string, reason: string) {
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

/**
 * Creates an in-memory cookie-backed session store for extension static assets.
 *
 * Use when:
 * - Main process needs short-lived cookie auth for plugin iframe asset loading
 * - Asset sessions must be revoked by asset id, owner plugin session, extension, or shutdown
 *
 * Expects:
 * - Session ids and cookie values are opaque and stored server-side only
 * - Callers set returned cookies on the returned cookie path
 *
 * Returns:
 * - Create, validate, refresh, and revoke operations for extension asset sessions
 */
export function createStaticAssetSessionStore(options: { now?: () => number } = {}): StaticAssetSessionStore {
  const now = options.now ?? (() => Date.now())
  const records = new Map<string, StaticAssetSessionRecord>()

  const dropIfExpired = (assetSessionId: string, record: StaticAssetSessionRecord) => {
    if (record.expiresAt > now()) {
      return false
    }

    records.delete(assetSessionId)
    return true
  }

  const readActiveRecord = (assetSessionId: string, expiredCode: string): { ok: false, result: { ok: false, error: HttpError } } | { ok: true, record: StaticAssetSessionRecord } => {
    const record = records.get(assetSessionId)
    if (!record) {
      return {
        ok: false as const,
        result: unauthorized('EXTENSION_ASSET_SESSION_NOT_FOUND', 'asset session was not found in session store'),
      }
    }

    if (dropIfExpired(assetSessionId, record)) {
      return {
        ok: false as const,
        result: unauthorized(expiredCode, 'asset session has expired'),
      }
    }

    return {
      ok: true as const,
      record,
    }
  }

  const createSession = (input: StaticAssetSessionCreateInput) => {
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
      throw new RangeError('Extension asset session ttlMs must be a finite positive number')
    }

    const assetSessionId = createOpaqueToken()
    const record: StaticAssetSessionRecord = {
      assetSessionId,
      extensionId: input.extensionId,
      version: input.version,
      ownerSessionId: input.ownerSessionId,
      pathPrefix: normalizePathPrefix(input.pathPrefix),
      ttlMs: input.ttlMs,
      cookieName: createStaticAssetSessionCookieName(assetSessionId),
      cookieValue: createOpaqueToken(),
      cookiePath: createCookiePath(input.extensionId, assetSessionId),
      expiresAt: now() + input.ttlMs,
    }

    records.set(assetSessionId, record)

    return createSessionSnapshot(record)
  }

  const validateRequest = (input: StaticAssetSessionValidateInput): StaticAssetSessionValidationResult => {
    const active = readActiveRecord(input.assetSessionId, 'EXTENSION_ASSET_SESSION_EXPIRED')
    if (!active.ok) {
      return active.result
    }

    const { record } = active
    if (!input.cookieValue) {
      return unauthorized('EXTENSION_ASSET_COOKIE_MISSING', 'asset session cookie is missing')
    }

    if (!cookieValuesMatch(record.cookieValue, input.cookieValue)) {
      return unauthorized('EXTENSION_ASSET_COOKIE_MISMATCH', 'asset session cookie does not match')
    }

    if (record.extensionId !== input.extensionId) {
      return unauthorized('EXTENSION_ASSET_EXTENSION_MISMATCH', 'asset session extensionId does not match request extensionId')
    }

    if (record.version !== input.version) {
      return unauthorized('EXTENSION_ASSET_VERSION_MISMATCH', 'asset session version does not match request version')
    }

    const isEmptyAssetPath = !input.assetPath.trim()
    if (isEmptyAssetPath) {
      return unauthorized('EXTENSION_ASSET_PATH_EMPTY', 'asset path is empty')
    }

    const normalizedAssetPath = normalizeAssetPath(input.assetPath)
    if (!normalizedAssetPath) {
      return unauthorized('EXTENSION_ASSET_PATH_PREFIX_MISMATCH', 'asset path is outside allowed prefix')
    }

    if (record.pathPrefix) {
      const isDirectoryPrefix = record.pathPrefix.endsWith('/')
      const isAllowed = isDirectoryPrefix
        ? normalizedAssetPath.startsWith(record.pathPrefix)
        : normalizedAssetPath === record.pathPrefix

      if (!isAllowed) {
        return unauthorized('EXTENSION_ASSET_PATH_PREFIX_MISMATCH', 'asset path is outside allowed prefix')
      }
    }

    return { ok: true, session: createSessionSnapshot(record) }
  }

  const revokeWhere = (predicate: (record: StaticAssetSessionRecord) => boolean) => {
    const revoked: StaticAssetSession[] = []
    for (const [assetSessionId, record] of records.entries()) {
      if (predicate(record)) {
        records.delete(assetSessionId)
        revoked.push(createSessionSnapshot(record))
      }
    }
    return revoked
  }

  return {
    createSession,
    validateRequest,
    refreshSession(assetSessionId) {
      const active = readActiveRecord(assetSessionId, 'EXTENSION_ASSET_SESSION_EXPIRED')
      if (!active.ok) {
        return undefined
      }

      active.record.expiresAt = now() + active.record.ttlMs
      return createSessionSnapshot(active.record)
    },
    revokeSession(assetSessionId) {
      const record = records.get(assetSessionId)
      if (!record) {
        return undefined
      }

      records.delete(assetSessionId)
      return createSessionSnapshot(record)
    },
    revokeByOwnerSessionId(ownerSessionId) {
      return revokeWhere(record => record.ownerSessionId === ownerSessionId)
    },
    revokeByExtensionId(extensionId) {
      return revokeWhere(record => record.extensionId === extensionId)
    },
    revokeAll() {
      return revokeWhere(() => true)
    },
  }
}
