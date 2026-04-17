import { errorMessageFrom } from '@moeru/std'

/**
 * Shape of errors produced by Better Auth's client (`authClient.signIn.email`,
 * `authClient.signUp.email`, etc.).
 *
 * Better Auth wraps responses with `@better-fetch/fetch`, which yields a plain
 * object (NOT an `Error` instance) in the `{ error }` tuple:
 *
 * ```ts
 * const { error } = await authClient.signIn.email({ ... })
 * // error => { status: 401, statusText: 'Unauthorized',
 * //            code: 'INVALID_EMAIL_OR_PASSWORD',
 * //            message: 'Invalid email or password' }
 * ```
 *
 * For HTTP 429 rate limiting, Better Auth's built-in rate limiter returns
 * `{ status: 429, statusText: 'Too Many Requests', message: '...' }` WITHOUT
 * a `code` field (see `better-auth/dist/api/rate-limiter/index.mjs`).
 */
export interface BetterAuthClientError {
  status?: number
  statusText?: string
  code?: string
  message?: string
}

/**
 * All Better Auth core error codes this app currently surfaces on the sign-in
 * / sign-up flow. Extracted from `BASE_ERROR_CODES` in
 * `better-auth/dist/test-utils/test-instance.d.mts`. Keep this list aligned
 * with the `signIn.error.codes.*` keys in the
 * `packages/i18n/src/locales/<locale>/server/auth.yaml` files.
 */
const KNOWN_AUTH_ERROR_CODES = new Set<string>([
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_EMAIL',
  'INVALID_PASSWORD',
  'INVALID_USER',
  'USER_NOT_FOUND',
  'USER_EMAIL_NOT_FOUND',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  'EMAIL_NOT_VERIFIED',
  'EMAIL_ALREADY_VERIFIED',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_ALREADY_SET',
  'USER_ALREADY_HAS_PASSWORD',
  'CREDENTIAL_ACCOUNT_NOT_FOUND',
  'ACCOUNT_NOT_FOUND',
  'SESSION_EXPIRED',
  'SESSION_NOT_FRESH',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'FAILED_TO_UNLINK_LAST_ACCOUNT',
  'SOCIAL_ACCOUNT_ALREADY_LINKED',
  'LINKED_ACCOUNT_ALREADY_EXISTS',
  'MISSING_FIELD',
  'VALIDATION_ERROR',
  'USER_DELETED',
])

/**
 * Resolves a Better Auth client error into a user-facing, localized message.
 *
 * Use when:
 * - Catching errors thrown from `authClient.*` methods in a Vue page/component.
 * - You need the message to reflect the specific failure (wrong password,
 *   rate limit, unverified email, etc.) in the user's current locale.
 *
 * Expects:
 * - `t` is the vue-i18n translator bound to the active locale.
 * - i18n keys `server.auth.signIn.error.codes.<CODE>`,
 *   `server.auth.signIn.error.rateLimited`, and
 *   `server.auth.signIn.error.unknown` exist in every locale file.
 *
 * Returns:
 * - Localized string, prioritizing in order:
 *   1. HTTP 429 → `signIn.error.rateLimited`
 *   2. Known `code` → `signIn.error.codes.<CODE>`
 *   3. Server-provided `message` (already human-readable, e.g. validation text)
 *   4. `errorMessageFrom(error)` from @moeru/std
 *   5. `signIn.error.unknown` fallback
 */
export function resolveAuthErrorMessage(
  error: unknown,
  t: (key: string, named?: Record<string, unknown>) => string,
): string {
  const err = (error ?? {}) as BetterAuthClientError

  // Rate limit has no `code`, only status 429. Check first so it beats any
  // incidental `message` passthrough.
  if (err.status === 429) {
    return t('server.auth.signIn.error.rateLimited')
  }

  const code = typeof err.code === 'string' ? err.code : undefined
  if (code && KNOWN_AUTH_ERROR_CODES.has(code)) {
    return t(`server.auth.signIn.error.codes.${code}`)
  }

  if (err.message && typeof err.message === 'string') {
    return err.message
  }

  return errorMessageFrom(error) ?? t('server.auth.signIn.error.unknown')
}
