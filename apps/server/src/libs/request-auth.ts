import type { AuthInstance } from './auth'
import type { Database } from './db'
import type { Env } from './env'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import * as authSchema from '../schemas/accounts'

type RequestAuthEnv = Pick<
  Env,
  | 'API_SERVER_URL'
  | 'TEST_AUTH_TOKEN'
  | 'TEST_AUTH_USER_ID'
  | 'TEST_AUTH_USER_EMAIL'
  | 'TEST_AUTH_USER_NAME'
  | 'TEST_AUTH_USER_ROLE'
>

export interface RequestAuthSession {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image?: string | null
    role?: string | null
    banned?: boolean | null
    banReason?: string | null
    banExpires?: Date | null
    lastSeenAt?: Date | null
    createdAt: Date
    updatedAt: Date
  }
  session: {
    id: string
    token: string
    userId: string
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
    ipAddress?: string | null
    userAgent?: string | null
    impersonatedBy?: string | null
  }
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

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function resolveTestAuthToken(env: RequestAuthEnv, accessToken: string): RequestAuthSession | null {
  if (!env.TEST_AUTH_TOKEN || !timingSafeStringEqual(accessToken, env.TEST_AUTH_TOKEN))
    return null

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000)
  const role = env.TEST_AUTH_USER_ROLE.trim()

  return {
    user: {
      id: env.TEST_AUTH_USER_ID,
      email: env.TEST_AUTH_USER_EMAIL.toLowerCase(),
      name: env.TEST_AUTH_USER_NAME,
      emailVerified: true,
      image: null,
      role: role || null,
      banned: false,
      banReason: null,
      banExpires: null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    } as RequestAuthSession['user'],
    session: {
      id: `test-auth:${env.TEST_AUTH_USER_ID}`,
      token: accessToken,
      userId: env.TEST_AUTH_USER_ID,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      ipAddress: null,
      userAgent: null,
    } as RequestAuthSession['session'],
  }
}

const cachedJWKS = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJWKS(env: RequestAuthEnv): ReturnType<typeof createRemoteJWKSet> {
  const jwksUrl = new URL('/api/auth/jwks', env.API_SERVER_URL).toString()
  const cached = cachedJWKS.get(jwksUrl)
  if (cached)
    return cached

  const jwks = createRemoteJWKSet(new URL(jwksUrl))
  cachedJWKS.set(jwksUrl, jwks)
  return jwks
}

/**
 * Verify a JWT access token issued by the OIDC provider.
 * Uses local signature verification via JWKS — no database query for the token itself.
 * Still requires one findUserById call to build the full RequestAuthSession.
 */
async function resolveJWTAccessToken(
  db: Database,
  env: RequestAuthEnv,
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

    // The resource server deliberately reads only its authorization projection.
    // It does not instantiate Better Auth or depend on its internal adapter.
    const user = await db.query.user.findFirst({
      where: eq(authSchema.user.id, payload.sub),
    })
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
  db: Database,
  env: RequestAuthEnv,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const session = await auth.api.getSession({ headers })
  if (session?.user && session?.session)
    return session

  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  const testSession = resolveTestAuthToken(env, accessToken)
  if (testSession)
    return testSession

  return await resolveJWTAccessToken(db, env, accessToken)
}

export async function resolveRequestAuth(
  db: Database,
  env: RequestAuthEnv,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  const testSession = resolveTestAuthToken(env, accessToken)
  const resolved = testSession ?? await resolveJWTAccessToken(db, env, accessToken)
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

/**
 * Resolve either a Better Auth session or an OIDC access token on the identity
 * surface. Business APIs must use {@link resolveRequestAuth} so they remain
 * independent from Better Auth runtime internals.
 */
export async function resolveIdentityRequestAuth(
  auth: AuthInstance,
  db: Database,
  env: RequestAuthEnv,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const resolved = await resolveSessionIgnoringBan(auth, db, env, headers)
  if (!resolved || isUserBannedNow(resolved.user))
    return null

  return resolved
}
