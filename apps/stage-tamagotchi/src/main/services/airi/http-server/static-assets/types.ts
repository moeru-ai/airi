import type { HttpError } from '../errors'

/**
 * Input required to create a cookie-backed static asset session.
 */
export interface StaticAssetSessionCreateInput {
  /** Plugin extension id that owns the served static assets. */
  extensionId: string
  /** Extension version expected by requests using this asset session. */
  version: string
  /** Parent plugin session id used for owner-scoped revocation. */
  ownerSessionId: string
  /**
   * Required allowed asset path prefix for this session.
   *
   * Empty string allows all UI assets, a trailing slash means directory prefix,
   * and no trailing slash means exact asset path.
   */
  pathPrefix: string
  /** Session lifetime in milliseconds from creation or refresh time. */
  ttlMs: number
}

/**
 * Cookie data returned after creating a static asset session.
 */
export interface StaticAssetSession {
  /** Opaque server-side session id embedded in extension asset routes. */
  readonly assetSessionId: string
  /** Cookie name callers set on the asset route path. */
  readonly cookieName: string
  /** Opaque cookie value required to validate asset requests. */
  readonly cookieValue: string
  /** Cookie path scope for browser requests. */
  readonly cookiePath: string
  /** Unix timestamp in milliseconds when the session expires. */
  readonly expiresAt: number
}

/**
 * Request data required to validate a cookie-backed static asset session.
 */
export interface StaticAssetSessionValidateInput {
  /** Plugin extension id from the requested route. */
  extensionId: string
  /** Extension version from the requested route. */
  version: string
  /** Opaque session id from the requested route. */
  assetSessionId: string
  /** Static asset path being requested. */
  assetPath: string
  /** Cookie value provided by the request, if any. */
  cookieValue: string | undefined
}

/**
 * Result of validating a cookie-backed static asset request.
 */
export type StaticAssetSessionValidationResult
  = | { ok: true, session: StaticAssetSession }
    | { ok: false, error: HttpError }

/**
 * In-memory store for cookie-backed extension static asset sessions.
 */
export interface StaticAssetSessionStore {
  /** Creates a new cookie-backed static asset session. */
  createSession: (input: StaticAssetSessionCreateInput) => StaticAssetSession
  /** Validates route and cookie data for a static asset request. */
  validateRequest: (input: StaticAssetSessionValidateInput) => StaticAssetSessionValidationResult
  /** Extends an existing session using its original TTL. */
  refreshSession: (assetSessionId: string) => StaticAssetSession | undefined
  /** Revokes one static asset session by id. */
  revokeSession: (assetSessionId: string) => StaticAssetSession | undefined
  /** Revokes all static asset sessions owned by a plugin session. */
  revokeByOwnerSessionId: (ownerSessionId: string) => StaticAssetSession[]
  /** Revokes all static asset sessions for one extension. */
  revokeByExtensionId: (extensionId: string) => StaticAssetSession[]
  /** Revokes every static asset session. */
  revokeAll: () => StaticAssetSession[]
}

export type StaticAssetResolveResult
  = | { ok: true, filePath: string, size: number, mtime: number }
    | { ok: false, error: HttpError }
