/**
 * Shared HTTP plumbing for the ui-server-auth → apps/server auth surface.
 *
 * Use when:
 * - Hitting any `/api/auth/...` endpoint from the UI (sign-in, sign-up,
 *   forgot-password, reset-password, social redirects).
 *
 * Expects:
 * - Caller passes `apiServerUrl` so dev (`http://localhost:3000`) and prod
 *   (`https://api.airi.build`) share the same modules.
 * - All requests go out with `credentials: 'include'`. The OIDC handoff
 *   downstream of email/password sign-in needs the better-auth session
 *   cookie. The stage-ui `authClient` uses Bearer-only and so cannot drive
 *   these flows directly.
 *
 * Returns:
 * - Plain async functions; throw `Error` with the server-supplied message on
 *   non-2xx so caller views see the real reason instead of a generic banner.
 */

/**
 * Common shape for any function in this module that needs to talk to the
 * auth server.
 */
export interface AuthFetchBase {
  apiServerUrl: string
  fetchImpl?: typeof fetch
}

/**
 * POST a JSON body to `/api/auth<path>` and parse the response with `parse`.
 *
 * Use when:
 * - You need a typed wrapper around a Better Auth POST endpoint that
 *   responds with JSON on both success and failure (the common case).
 *
 * Expects:
 * - `path` includes the leading slash (e.g. `/sign-in/email`).
 * - `parse` runs only on 2xx responses; on non-2xx the wrapper throws.
 *
 * Returns:
 * - Whatever `parse` returns. Never returns on non-2xx — throws an `Error`
 *   carrying the server's `message` / `error.message` field.
 */
export async function postAuthJSON<T>(
  base: AuthFetchBase,
  path: string,
  body: Record<string, unknown>,
  parse: (data: unknown, response: Response) => T,
): Promise<T> {
  const fetchImpl = base.fetchImpl ?? fetch
  const endpoint = new URL(`/api/auth${path}`, base.apiServerUrl)

  const response = await fetchImpl(endpoint.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })

  let data: unknown
  try {
    data = await response.json()
  }
  catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(extractAuthError(data) ?? `Auth request failed (${response.status})`)
  }

  return parse(data, response)
}

/**
 * Pull a human-readable error string out of a Better Auth JSON error response.
 *
 * Before:
 * - `{ "message": "Invalid credentials", "code": "INVALID_CREDENTIALS" }`
 * - `{ "error": { "message": "Token expired" } }`
 * - `{ "error": "Rate limit" }`
 *
 * After:
 * - `"Invalid credentials"` / `"Token expired"` / `"Rate limit"`
 *
 * Returns `null` when the payload has no message-like field, leaving the
 * caller to fall back to a status-code-only message.
 */
export function extractAuthError(data: unknown): string | null {
  if (!data || typeof data !== 'object')
    return null

  const maybe = data as { error?: unknown, message?: unknown }
  if (typeof maybe.message === 'string')
    return maybe.message

  const error = maybe.error
  if (typeof error === 'string')
    return error

  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return null
}
