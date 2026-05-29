import type auth from '../scripts/auth'
import type { AuthInstance } from './auth'
import type { Env } from './env'

import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface RequestAuthSession {
  user: typeof auth.$Infer.Session.user
  session: typeof auth.$Infer.Session.session
}

/**
 * Whether a user is currently banned, honoring `banExpires`.
 *
 * The better-auth `admin` plugin auto-clears an expired ban only on the next
 * login attempt (`session.create.before`); the stateless OIDC JWT hot path
 * never creates a session, so we evaluate expiry here too — a `banned` row
 * whose `banExpires` is in the past is treated as not banned.
 */
export function isUserBannedNow(user: { banned?: boolean | null, banExpires?: Date | string | null }): boolean {
  if (!user.banned)
    return false
  if (user.banExpires == null)
    return true
  return new Date(user.banExpires).getTime() > Date.now()
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function getJWKS(env: Env): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(
      new URL('/api/auth/jwks', env.API_SERVER_URL),
    )
  }
  return cachedJWKS
}

/**
 * Verify a JWT access token issued by the OIDC provider.
 * Uses local signature verification via JWKS — no database query for the token itself.
 * Still requires one findUserById call to build the full RequestAuthSession.
 */
async function resolveJWTAccessToken(
  auth: AuthInstance,
  env: Env,
  accessToken: string,
): Promise<RequestAuthSession | null> {
  try {
    const jwks = getJWKS(env)
    // NOTICE: better-auth's jwt() plugin sets issuer to the full baseURL
    // including the path prefix (e.g. "http://localhost:3000/api/auth"),
    // not just the server origin.
    const { payload } = await jwtVerify(accessToken, jwks, {
      issuer: `${env.API_SERVER_URL}/api/auth`,
      audience: env.API_SERVER_URL,
    })

    if (!payload.sub)
      return null

    const ctx = await auth.$context
    // NOTICE:
    // internalAdapter.findUserById is typed as better-auth's base User and omits
    // the admin-plugin fields (banned/role/banReason/banExpires), but the query
    // selects the full row so the runtime value carries them. Widen to the
    // inferred session user so `banned` is visible to isUserBannedNow and the
    // RequestAuthSession return type matches.
    // Removal condition: better-auth's adapter return type includes plugin fields.
    const user = await ctx.internalAdapter.findUserById(payload.sub) as RequestAuthSession['user'] | null
    if (!user)
      return null

    return {
      user,
      session: {
        id: payload.jti ?? payload.sub,
        token: accessToken,
        userId: payload.sub,
        createdAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
        updatedAt: payload.iat ? new Date(payload.iat * 1000) : new Date(),
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : new Date(),
        ipAddress: null,
        userAgent: null,
      },
    }
  }
  catch {
    return null
  }
}

/**
 * Resolve a session from request headers WITHOUT applying the ban gate.
 *
 * Use when:
 * - A caller needs the verified principal but will make its own ban decision,
 *   e.g. the OIDC `/oauth2/userinfo` guard that wants to 403 a banned subject
 *   distinctly from an invalid/expired token.
 *
 * Do NOT use this on request-serving paths to obtain `c.get('user')` — that is
 * what {@link resolveRequestAuth} is for, and it applies the ban gate. Using
 * this resolver there would silently let banned principals through.
 */
export async function resolveSessionIgnoringBan(
  auth: AuthInstance,
  env: Env,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const session = await auth.api.getSession({ headers })
  if (session?.user && session?.session)
    return session

  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  return await resolveJWTAccessToken(auth, env, accessToken)
}

export async function resolveRequestAuth(
  auth: AuthInstance,
  env: Env,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const resolved = await resolveSessionIgnoringBan(auth, env, headers)
  if (!resolved)
    return null

  // Reject banned principals on every request. OIDC JWT access tokens are
  // stateless — verified by signature, not by a session row — so the admin
  // plugin's session.create.before hook (which only fires on login) cannot
  // invalidate a token mid-TTL. Re-checking `user.banned` here (free: the user
  // row is already loaded) is what makes a ban take effect immediately across
  // the HTTP, WebSocket, and OIDC token paths that funnel through this function.
  if (isUserBannedNow(resolved.user))
    return null

  return resolved
}
