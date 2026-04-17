import type { AuthInstance } from './auth'
import type { Database } from './db'
import type { Env } from './env'

import { and, desc, eq, gt } from 'drizzle-orm'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { session as sessionTable } from '../schemas/accounts'

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS(env: Env): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL('/api/auth/jwks', env.API_SERVER_URL))
  }
  return cachedJWKS
}

/**
 * Verify an OIDC JWT access token and extract the userId (`sub`).
 *
 * Use when:
 * - Determining whether a Bearer token is an OIDC JWT (vs. Better Auth session token).
 *
 * Expects:
 * - `token` is a raw bearer string (no "Bearer " prefix).
 *
 * Returns:
 * - `userId` for valid OIDC JWTs, or `null` for anything else (Better Auth
 *   session tokens, malformed JWTs, expired tokens, bad signatures).
 */
async function verifyOIDCAccessToken(env: Env, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(env), {
      issuer: `${env.API_SERVER_URL}/api/auth`,
      audience: env.API_SERVER_URL,
    })
    return typeof payload.sub === 'string' ? payload.sub : null
  }
  catch {
    return null
  }
}

/**
 * Find an existing non-expired Better Auth session token for this user,
 * or mint a new one via Better Auth's internal adapter.
 *
 * Use when:
 * - Bridging an OIDC JWT caller to Better Auth endpoints that require a
 *   native Better Auth session token (bearer() plugin only recognizes those).
 *
 * Expects:
 * - `userId` references an existing `user` row.
 *
 * Returns:
 * - A bearer token string that Better Auth's bearer() plugin will accept.
 *
 * NOTICE:
 * Reuses the longest-lived non-expired session to avoid spamming the session
 * table. Better Auth's own session cleanup task will reap expired rows.
 */
async function ensureBetterAuthSession(
  auth: AuthInstance,
  db: Database,
  userId: string,
): Promise<string> {
  const now = new Date()
  const [existing] = await db
    .select({ token: sessionTable.token })
    .from(sessionTable)
    .where(and(
      eq(sessionTable.userId, userId),
      gt(sessionTable.expiresAt, now),
    ))
    .orderBy(desc(sessionTable.expiresAt))
    .limit(1)

  if (existing?.token)
    return existing.token

  const ctx = await auth.$context
  const created = await ctx.internalAdapter.createSession(userId, false)
  return created.token
}

/**
 * Create a bridge function that transparently upgrades OIDC JWT access tokens
 * to Better Auth session tokens before forwarding the request to Better Auth.
 *
 * Use when:
 * - Wrapping the Better Auth catch-all handler at `/api/auth/*` so that users
 *   who signed in via OIDC (Google/GitHub) can also hit endpoints guarded by
 *   Better Auth's bearer() plugin (list-accounts, change-password, unlink-account,
 *   delete-user, update-user, etc.).
 *
 * Expects:
 * - Called per-request, receives the raw `Request` and returns a (possibly new)
 *   `Request` with rewritten `Authorization` header.
 *
 * Returns:
 * - The same request when no Bearer token is present, or when the token is not
 *   an OIDC JWT (Better Auth will handle native session tokens itself).
 * - A cloned request with upgraded Authorization header when the token is OIDC JWT.
 *
 * Call stack:
 *
 * createAuthRoutes (../routes/auth)
 *   -> {@link createAuthBridge}
 *     -> {@link verifyOIDCAccessToken}
 *     -> {@link ensureBetterAuthSession}
 */
export function createAuthBridge(auth: AuthInstance, db: Database, env: Env) {
  return async function authBridge(request: Request): Promise<Request> {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return request

    const token = authHeader.slice(7).trim()
    if (!token)
      return request

    const userId = await verifyOIDCAccessToken(env, token)
    if (!userId)
      // Not an OIDC JWT — could be a Better Auth session token or garbage.
      // Let Better Auth's bearer() plugin judge it natively.
      return request

    const bearerToken = await ensureBetterAuthSession(auth, db, userId)

    const headers = new Headers(request.headers)
    headers.set('authorization', `Bearer ${bearerToken}`)

    return new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      // NOTICE: Node's undici Request requires `duplex: 'half'` when a streaming
      // body is present. Cast via Record to avoid DOM lib type mismatch.
      ...(request.body ? { duplex: 'half' } : {}),
    } as RequestInit)
  }
}

export type AuthBridge = ReturnType<typeof createAuthBridge>
